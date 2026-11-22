import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { newId } from "./auth";
import { solanaAssets } from "./catalog";
import { one, query } from "./db";
import type { Interval } from "./goals";
import { priceHistory, type TmAsset } from "./tm";

/**
 * "Try the demo": a throwaway account with simulated cash and three jars already part-filled.
 * Past buys are priced from real True Markets history, so each jar's growth is the asset's actual move.
 */

export const DEMO_CASH = 250;
const DAY = 864e5;

type Buy = [daysAgo: number, usd: number, source: "manual" | "auto"];
type Plan = {
  symbols: string[]; // first one available on the Gateway wins
  name: string;
  emoji: string;
  target: number;
  deadlineDays: number | null;
  auto: { amount: number; interval: Interval; nextInDays: number } | null;
  buys: Buy[];
};

const PLANS: Plan[] = [
  {
    symbols: ["QQQX", "AAPLX", "SOL"],
    name: "New laptop",
    emoji: "💻",
    target: 1800,
    deadlineDays: 150,
    auto: { amount: 40, interval: "weekly", nextInDays: 6 },
    buys: [[28, 250, "manual"], [24, 150, "manual"], [21, 40, "auto"], [14, 40, "auto"], [10, 250, "manual"], [7, 40, "auto"], [6, 200, "manual"], [3, 100, "manual"]],
  },
  {
    symbols: ["SPYX", "QQQX", "SOL"],
    name: "Emergency fund",
    emoji: "🛟",
    target: 3000,
    deadlineDays: null,
    auto: { amount: 150, interval: "monthly", nextInDays: 10 },
    buys: [[27, 250, "manual"], [20, 150, "auto"], [15, 200, "manual"], [8, 200, "manual"], [2, 150, "manual"]],
  },
  {
    symbols: ["GLDX", "SPYX", "SOL"],
    name: "Trip to Japan",
    emoji: "🗾",
    target: 2500,
    deadlineDays: 300,
    auto: null,
    buys: [[25, 150, "manual"], [9, 100, "manual"], [4, 50, "manual"]],
  },
];

/** Price at (or just before) `at`, from a 30-day history. Falls back to the latest point. */
function priceAt(points: { t: number; p: number }[], at: number) {
  let best = points.at(-1)!;
  for (const pt of points) if (pt.t <= at) best = pt;
  return best.p;
}

async function history(asset: TmAsset) {
  const res = await priceHistory(asset.economic_asset_id, "30d", "12h").catch(() => null);
  return (res?.points ?? [])
    .map((x) => ({ t: new Date(x.t).getTime(), p: Number(x.price) }))
    .filter((x) => Number.isFinite(x.t) && Number.isFinite(x.p) && x.p > 0)
    .sort((a, b) => a.t - b.t);
}

export async function createDemoAccount(): Promise<string> {
  // Housekeeping: demo accounts live for a day.
  await query("DELETE FROM users WHERE is_demo AND created_at < now() - interval '24 hours'");

  const assets = await solanaAssets();
  const bySymbol = new Map(assets.map((a) => [a.symbol, a]));
  const chosen = PLANS.map((plan) => ({ plan, asset: plan.symbols.map((s) => bySymbol.get(s)).find(Boolean) })).filter(
    (x): x is { plan: Plan; asset: TmAsset } => Boolean(x.asset),
  );
  const histories = new Map(await Promise.all(chosen.map(async ({ asset }) => [asset.id, await history(asset)] as const)));

  const userId = newId();
  const now = Date.now();
  await one(
    `INSERT INTO users (id, email, name, password_hash, is_demo, demo_cash, created_at)
     VALUES ($1,$2,'Sam',$3,true,$4,now()) RETURNING id`,
    [userId, `demo.${userId}@demo.jarful.invalid`, await bcrypt.hash(randomBytes(24).toString("hex"), 4), DEMO_CASH],
  );

  for (const { plan, asset } of chosen) {
    const points = histories.get(asset.id) ?? [];
    if (!points.length) continue; // no price data: skip rather than invent numbers
    const goalId = newId();
    await query(
      `INSERT INTO goals (id, user_id, name, emoji, target_usd, asset_id, economic_id, asset_symbol, asset_name, asset_icon, asset_decimals,
                          deadline, auto_amount, auto_interval, next_run_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        goalId, userId, plan.name, plan.emoji, plan.target, asset.id, asset.economic_asset_id, asset.symbol, asset.name,
        asset.image?.small ?? null, asset.decimals,
        plan.deadlineDays ? new Date(now + plan.deadlineDays * DAY).toISOString().slice(0, 10) : null,
        plan.auto?.amount ?? null, plan.auto?.interval ?? null,
        plan.auto ? new Date(now + plan.auto.nextInDays * DAY) : null,
        new Date(now - 30 * DAY),
      ],
    );
    for (const [daysAgo, usd, source] of plan.buys) {
      const at = now - daysAgo * DAY;
      const qty = usd / priceAt(points, at);
      await query(
        `INSERT INTO contributions (id, goal_id, user_id, side, source, usd_amount, qty, est_qty, status, created_at, updated_at)
         VALUES ($1,$2,$3,'buy',$4,$5,$6,$6,'complete',$7,$7)`,
        [newId(), goalId, userId, source, usd, qty, new Date(at)],
      );
    }
  }
  return userId;
}
