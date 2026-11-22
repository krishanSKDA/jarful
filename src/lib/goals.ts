import { query, one } from "./db";
import { config } from "./env";
import { ensureProvisioned, newId, USER_COLUMNS, type User } from "./auth";
import { latestPrices, fundingAsset } from "./catalog";
import { createMarketOrder, executeOrder, getBalances, getOrder, TmError, type TmOrderStatus } from "./tm";

export type Interval = "daily" | "weekly" | "monthly";

export type GoalRow = {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  target_usd: number;
  asset_id: string;
  economic_id: string;
  asset_symbol: string;
  asset_name: string;
  asset_icon: string | null;
  asset_decimals: number;
  deadline: string | Date | null;
  auto_amount: number | null;
  auto_interval: Interval | null;
  next_run_at: Date | null;
  status: "active" | "archived";
  created_at: Date;
};

export type ContributionRow = {
  id: string;
  goal_id: string;
  order_id: string | null;
  side: "buy" | "sell";
  source: "manual" | "auto";
  usd_amount: number | null;
  qty: number | null;
  est_qty: number | null;
  status: "placing" | "pending" | "complete" | "failed" | "canceled";
  error: string | null;
  created_at: Date;
};

export type GoalView = GoalRow & {
  qty: number; // settled units held for this goal
  pendingQty: number; // units in orders still settling
  invested: number; // net USDC put in (buys - sells)
  price: number | null;
  value: number; // (qty + pendingQty) * price
  progress: number; // 0..1+
};

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

function normalizeGoal(g: GoalRow): GoalRow {
  return {
    ...g,
    target_usd: n(g.target_usd),
    auto_amount: g.auto_amount === null ? null : n(g.auto_amount),
    asset_decimals: n(g.asset_decimals),
  };
}

// ---------------------------------------------------------------- reads

export async function listGoals(userId: string): Promise<GoalView[]> {
  const goals = (await query<GoalRow>("SELECT * FROM goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at", [userId])).map(normalizeGoal);
  if (!goals.length) return [];
  const sums = await query<{ goal_id: string; qty: number; pending_qty: number; invested: number }>(
    `SELECT goal_id,
            COALESCE(SUM(CASE WHEN status='complete' THEN (CASE WHEN side='buy' THEN qty ELSE -qty END) END),0) AS qty,
            COALESCE(SUM(CASE WHEN status IN ('placing','pending') AND side='buy' THEN est_qty END),0) AS pending_qty,
            COALESCE(SUM(CASE WHEN status='complete' OR (status IN ('placing','pending') AND side='buy')
                              THEN (CASE WHEN side='buy' THEN usd_amount ELSE -usd_amount END) END),0) AS invested
       FROM contributions WHERE user_id = $1 GROUP BY goal_id`,
    [userId],
  );
  const byGoal = new Map(sums.map((s) => [s.goal_id, s]));
  const prices = await latestPrices(goals.map((g) => g.economic_id));
  return goals.map((g) => {
    const s = byGoal.get(g.id);
    const qty = Math.max(0, n(s?.qty));
    const pendingQty = n(s?.pending_qty);
    const price = prices.get(g.economic_id) ?? null;
    const value = price ? (qty + pendingQty) * price : 0;
    return { ...g, qty, pendingQty, invested: Math.max(0, n(s?.invested)), price, value, progress: g.target_usd > 0 ? value / g.target_usd : 0 };
  });
}

export async function getGoal(userId: string, goalId: string): Promise<GoalView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(goalId)) return null;
  return (await listGoals(userId)).find((g) => g.id === goalId) ?? null;
}

export async function goalContributions(userId: string, goalId: string) {
  const rows = await query<ContributionRow>(
    "SELECT * FROM contributions WHERE user_id = $1 AND goal_id = $2 ORDER BY created_at DESC LIMIT 100",
    [userId, goalId],
  );
  return rows.map((r) => ({ ...r, usd_amount: r.usd_amount === null ? null : n(r.usd_amount), qty: r.qty === null ? null : n(r.qty), est_qty: r.est_qty === null ? null : n(r.est_qty) }));
}

/** Spendable USDC on Solana for this user. */
export async function cashBalance(user: User): Promise<number> {
  if (user.is_demo) return n((await one<{ demo_cash: number }>("SELECT demo_cash FROM users WHERE id = $1", [user.id]))?.demo_cash);
  if (!user.tm_user_id) return 0;
  const [{ data }, usdc] = await Promise.all([getBalances(user.tm_user_id), fundingAsset()]);
  const row = data.find((b) => (usdc && b.asset_id === usdc.id) || (b.symbol === "USDC" && b.chain === "solana"));
  return n(row?.available);
}

// ---------------------------------------------------------------- writes

export function nextRun(from: Date, interval: Interval): Date {
  const d = new Date(from);
  if (interval === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (interval === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export class UserFacingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Turn API errors into sentences a customer can act on. */
export function friendly(err: unknown): { message: string; status: number } {
  if (err instanceof UserFacingError) return { message: err.message, status: err.status };
  if (err instanceof TmError) {
    switch (err.code) {
      case "insufficient_balance":
        return { message: "There isn't enough cash in your wallet for this. Add USDC on Solana, then try again.", status: 422 };
      case "quote_stale":
        return { message: "The price moved before the order landed. Nothing was spent. Try again.", status: 409 };
      case "country_restricted":
        return { message: "This asset isn't available in your country.", status: 403 };
      case "already_submitted":
        return { message: "This order was already sent.", status: 409 };
      case "resource_exhausted":
        return { message: "Too many requests right now. Wait a few seconds and try again.", status: 429 };
    }
    if (err.status >= 500) return { message: "The trading service is unavailable. Try again in a minute.", status: 503 };
    return { message: err.message, status: err.status >= 400 && err.status < 500 ? err.status : 400 };
  }
  console.error(err);
  return { message: "Something went wrong on our side. Try again.", status: 500 };
}

function mapStatus(s: TmOrderStatus | string): ContributionRow["status"] {
  if (s === "complete") return "complete";
  if (s === "failed") return "failed";
  if (s === "canceled") return "canceled";
  return "pending";
}

/** Buy `usd` worth of the goal's asset. Records the contribution before executing so nothing goes untracked. */
export async function contribute(userIn: User, goal: GoalRow, usd: number, source: "manual" | "auto" = "manual") {
  if (!Number.isFinite(usd) || usd < config.minOrderUsd) throw new UserFacingError(`The smallest amount is $${config.minOrderUsd}.`);
  if (usd > config.maxOrderUsd) throw new UserFacingError(`The largest single amount is $${config.maxOrderUsd}.`);
  if (userIn.is_demo) return demoBuy(userIn, goal, usd, source);
  const user = await ensureProvisioned(userIn);
  const amount = usd.toFixed(2);

  const order = await createMarketOrder(user.tm_user_id!, goal.asset_id, "buy", amount);
  const id = newId();
  await query(
    `INSERT INTO contributions (id, goal_id, user_id, order_id, side, source, usd_amount, est_qty, status)
     VALUES ($1,$2,$3,$4,'buy',$5,$6,$7,'placing')`,
    [id, goal.id, user.id, order.order_id, source, amount, order.quote?.qty_out ?? null],
  );
  try {
    const executed = await executeOrder(user.tm_user_id!, order);
    await query("UPDATE contributions SET status = $2, updated_at = now() WHERE id = $1", [id, mapStatus(executed.status)]);
  } catch (err) {
    const f = friendly(err);
    await query("UPDATE contributions SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [id, f.message]);
    throw err;
  }
  return syncContribution(user, id);
}

/** Move every unit held for this goal back to cash (market sell). */
export async function withdraw(userIn: User, goal: GoalView) {
  if (userIn.is_demo) return demoSell(userIn, goal);
  const user = await ensureProvisioned(userIn);
  const { data } = await getBalances(user.tm_user_id!);
  const walletQty = n(data.find((b) => b.asset_id === goal.asset_id)?.available);
  const sellable = Math.min(goal.qty, walletQty);
  const factor = 10 ** Math.min(goal.asset_decimals, 9);
  const qty = Math.floor(sellable * factor) / factor;
  if (qty <= 0 || (goal.price !== null && qty * goal.price < 0.5)) {
    throw new UserFacingError(goal.pendingQty > 0 ? "Your last buy is still settling. Try again in a minute." : "There's nothing in this jar to cash out yet.");
  }
  const qtyStr = qty.toFixed(Math.min(goal.asset_decimals, 9));
  const order = await createMarketOrder(user.tm_user_id!, goal.asset_id, "sell", qtyStr);
  const id = newId();
  await query(
    `INSERT INTO contributions (id, goal_id, user_id, order_id, side, source, usd_amount, qty, status)
     VALUES ($1,$2,$3,$4,'sell','manual',$5,$6,'placing')`,
    [id, goal.id, user.id, order.order_id, goal.price ? (qty * goal.price).toFixed(2) : null, qtyStr],
  );
  try {
    const executed = await executeOrder(user.tm_user_id!, order);
    await query("UPDATE contributions SET status = $2, updated_at = now() WHERE id = $1", [id, mapStatus(executed.status)]);
  } catch (err) {
    await query("UPDATE contributions SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [id, friendly(err).message]);
    throw err;
  }
  return syncContribution(user, id);
}

/** Refresh one contribution from the Gateway order. Fills in the executed quantity once settled. */
export async function syncContribution(user: User, contributionId: string) {
  const c = await one<ContributionRow>("SELECT * FROM contributions WHERE id = $1 AND user_id = $2", [contributionId, user.id]);
  if (!c) return null;
  if (user.is_demo) return settleDemo(c);
  if (!c.order_id || !user.tm_user_id || ["complete", "failed", "canceled"].includes(c.status)) return c;
  const order = await getOrder(user.tm_user_id, c.order_id);
  const status = mapStatus(order.status);
  const executedQty = order.executed_qty !== undefined && order.executed_qty !== null && order.executed_qty !== "" ? Number(order.executed_qty) : null;
  const vwap = order.executed_vwap ? Number(order.executed_vwap) : null;
  const fee = order.fee ? Number(order.fee) : 0;

  let qty = c.qty;
  let usd = c.usd_amount;
  if (status === "complete" && executedQty !== null) {
    qty = executedQty;
    if (c.side === "sell" && vwap) usd = Math.max(0, executedQty * vwap - fee);
  }
  const updated = await one<ContributionRow>(
    `UPDATE contributions SET status = $2, qty = $3, usd_amount = $4, updated_at = now() WHERE id = $1 RETURNING *`,
    [c.id, status, qty, usd],
  );
  return updated;
}

// ---------------------------------------------------------------- demo accounts
// Demo accounts trade against live True Markets prices but never place a real order:
// cash is a number in the database and a buy "settles" a couple of seconds after it is placed.

const DEMO_SETTLE_MS = 2500;

async function livePrice(economicId: string) {
  const p = (await latestPrices([economicId])).get(economicId);
  if (!p) throw new UserFacingError("There's no live price for this asset right now. Try again in a minute.", 503);
  return p;
}

/** Simulated quote at the live price (demo accounts have no Gateway user to quote for). */
export async function demoQuote(economicId: string, usd: number) {
  const price = await livePrice(economicId);
  return { qty: usd / price, price, fee: 0, notional: usd };
}

async function demoBuy(user: User, goal: GoalRow, usd: number, source: "manual" | "auto") {
  const price = await livePrice(goal.economic_id);
  const amount = Math.round(usd * 100) / 100;
  const paid = await one("UPDATE users SET demo_cash = demo_cash - $2 WHERE id = $1 AND is_demo AND demo_cash >= $2 RETURNING id", [user.id, amount]);
  if (!paid) throw new UserFacingError("There isn't enough demo cash for this. Cash out a jar to free some up.", 422);
  return one<ContributionRow>(
    `INSERT INTO contributions (id, goal_id, user_id, side, source, usd_amount, est_qty, status)
     VALUES ($1,$2,$3,'buy',$4,$5,$6,'pending') RETURNING *`,
    [newId(), goal.id, user.id, source, amount, amount / price],
  );
}

async function demoSell(user: User, goal: GoalView) {
  if (goal.pendingQty > 0) throw new UserFacingError("Your last buy is still settling. Try again in a moment.");
  if (goal.qty <= 0 || !goal.price || goal.qty * goal.price < 0.5) throw new UserFacingError("There's nothing in this jar to cash out yet.");
  const proceeds = Math.floor(goal.qty * goal.price * 100) / 100;
  const row = await one<ContributionRow>(
    `INSERT INTO contributions (id, goal_id, user_id, side, source, usd_amount, qty, status)
     VALUES ($1,$2,$3,'sell','manual',$4,$5,'complete') RETURNING *`,
    [newId(), goal.id, user.id, proceeds, goal.qty],
  );
  await query("UPDATE users SET demo_cash = demo_cash + $2 WHERE id = $1 AND is_demo", [user.id, proceeds]);
  return row;
}

async function settleDemo(c: ContributionRow) {
  if (c.status !== "pending" || Date.now() - new Date(c.created_at).getTime() < DEMO_SETTLE_MS) return c;
  return (await one<ContributionRow>("UPDATE contributions SET status = 'complete', qty = est_qty, updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING *", [c.id])) ?? c;
}

/** A demo account's trades, shaped for the activity page. */
export async function demoActivity(userId: string) {
  const rows = await query<ContributionRow & { asset_symbol: string; goal_name: string; goal_emoji: string }>(
    `SELECT c.*, g.asset_symbol, g.name AS goal_name, g.emoji AS goal_emoji
       FROM contributions c JOIN goals g ON g.id = c.goal_id
      WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT 50`,
    [userId],
  );
  return rows.map((r) => ({ ...r, usd_amount: r.usd_amount === null ? null : n(r.usd_amount), qty: r.qty === null ? null : n(r.qty), est_qty: r.est_qty === null ? null : n(r.est_qty) }));
}

/** Sync recent unsettled contributions for a user (bounded, so page loads stay fast). */
export async function syncPending(user: User) {
  if (user.is_demo) {
    await query(
      `UPDATE contributions SET status = 'complete', qty = est_qty, updated_at = now()
        WHERE user_id = $1 AND status = 'pending' AND created_at < now() - make_interval(secs => $2)`,
      [user.id, DEMO_SETTLE_MS / 1000],
    );
    return;
  }
  const pending = await query<{ id: string }>(
    `SELECT id FROM contributions WHERE user_id = $1 AND status IN ('placing','pending') AND order_id IS NOT NULL
       AND created_at > now() - interval '7 days' ORDER BY created_at DESC LIMIT 8`,
    [user.id],
  );
  await Promise.all(pending.map((p) => syncContribution(user, p.id).catch(() => null)));
}

// ---------------------------------------------------------------- auto-invest

/** Run every auto-invest that is due. Each goal is claimed atomically so overlapping runs never double-buy. */
export async function runDueAutoInvests(limit = 25) {
  const due = await query<GoalRow>(
    `SELECT * FROM goals WHERE status = 'active' AND auto_amount IS NOT NULL AND next_run_at <= now()
        AND user_id NOT IN (SELECT id FROM users WHERE is_demo)
      ORDER BY next_run_at LIMIT $1`,
    [limit],
  );
  const results: { goalId: string; ok: boolean; message?: string }[] = [];
  for (const raw of due) {
    const goal = normalizeGoal(raw);
    const next = nextRun(new Date(), goal.auto_interval ?? "weekly");
    const claimed = await one("UPDATE goals SET next_run_at = $2 WHERE id = $1 AND next_run_at = $3 RETURNING id", [goal.id, next, raw.next_run_at]);
    if (!claimed) continue;
    const user = await one<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [goal.user_id]);
    if (!user) continue;
    try {
      await contribute(user, goal, goal.auto_amount!, "auto");
      results.push({ goalId: goal.id, ok: true });
    } catch (err) {
      const f = friendly(err);
      // Record the skipped run so the customer sees why their jar didn't grow.
      await query(
        `INSERT INTO contributions (id, goal_id, user_id, side, source, usd_amount, status, error)
         SELECT $1,$2,$3,'buy','auto',$4,'failed',$5
          WHERE NOT EXISTS (SELECT 1 FROM contributions WHERE goal_id = $2 AND source = 'auto' AND status = 'failed' AND created_at > now() - interval '1 minute')`,
        [newId(), goal.id, user.id, goal.auto_amount, f.message],
      );
      results.push({ goalId: goal.id, ok: false, message: f.message });
    }
  }
  return results;
}
