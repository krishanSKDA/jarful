import { z } from "zod";
import { authed, body, fail, ok } from "@/lib/api";
import { query } from "@/lib/db";
import { config } from "@/lib/env";
import { getGoal, nextRun, UserFacingError } from "@/lib/goals";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  targetUsd: z.number().min(5).max(1_000_000).optional(),
  autoAmount: z.number().nullable().optional(),
  autoInterval: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
});

export const GET = authed<Ctx>(async (_req, { params }, user) => {
  const goal = await getGoal(user.id, (await params).id);
  return goal ? ok({ goal }) : fail("Goal not found.", 404);
});

export const PATCH = authed<Ctx>(async (req, { params }, user) => {
  const goal = await getGoal(user.id, (await params).id);
  if (!goal) return fail("Goal not found.", 404);
  const input = await body(req, Patch);

  if (input.name !== undefined || input.targetUsd !== undefined) {
    await query("UPDATE goals SET name = COALESCE($2, name), target_usd = COALESCE($3, target_usd) WHERE id = $1", [
      goal.id, input.name ?? null, input.targetUsd ?? null,
    ]);
  }
  if (input.autoAmount !== undefined) {
    if (input.autoAmount === null) {
      await query("UPDATE goals SET auto_amount = NULL, auto_interval = NULL, next_run_at = NULL WHERE id = $1", [goal.id]);
    } else {
      if (input.autoAmount < config.minOrderUsd || input.autoAmount > config.maxOrderUsd) {
        throw new UserFacingError(`Auto-invest amounts must be between $${config.minOrderUsd} and $${config.maxOrderUsd}.`);
      }
      const interval = input.autoInterval ?? goal.auto_interval ?? "weekly";
      await query("UPDATE goals SET auto_amount = $2, auto_interval = $3, next_run_at = $4 WHERE id = $1", [
        goal.id, input.autoAmount, interval, nextRun(new Date(), interval),
      ]);
    }
  }
  return ok({ goal: await getGoal(user.id, goal.id) });
});

/** Archive a jar. Only allowed once it's empty, so money is never hidden from view. */
export const DELETE = authed<Ctx>(async (_req, { params }, user) => {
  const goal = await getGoal(user.id, (await params).id);
  if (!goal) return fail("Goal not found.", 404);
  if (goal.qty + goal.pendingQty > 0 && goal.value >= 0.5) {
    throw new UserFacingError("Cash out this jar before deleting it.");
  }
  await query("UPDATE goals SET status = 'archived', auto_amount = NULL, next_run_at = NULL WHERE id = $1", [goal.id]);
  return ok({ ok: true });
});
