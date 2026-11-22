import { z } from "zod";
import { authed, body, ok } from "@/lib/api";
import { newId } from "@/lib/auth";
import { findAsset } from "@/lib/catalog";
import { query } from "@/lib/db";
import { config } from "@/lib/env";
import { listGoals, nextRun, UserFacingError } from "@/lib/goals";

const Schema = z
  .object({
    name: z.string().trim().min(1, "Give your goal a name.").max(40, "Keep the name under 40 characters."),
    emoji: z.string().trim().min(1).max(8).default("🎯"),
    targetUsd: z.number().min(5, "Set a target of at least $5.").max(1_000_000),
    assetId: z.string().uuid("Choose what to invest in."),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    autoAmount: z.number().nullable().optional(),
    autoInterval: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
  })
  .refine((v) => !v.autoAmount || (v.autoAmount >= config.minOrderUsd && v.autoAmount <= config.maxOrderUsd), {
    message: `Auto-invest amounts must be between $${config.minOrderUsd} and $${config.maxOrderUsd}.`,
  });

export const GET = authed(async (_req, _ctx, user) => ok({ goals: await listGoals(user.id) }));

export const POST = authed(async (req, _ctx, user) => {
  const input = await body(req, Schema);
  const asset = await findAsset(input.assetId);
  if (!asset) throw new UserFacingError("That asset isn't available to buy right now.");
  const count = await query<{ c: number }>("SELECT COUNT(*)::int AS c FROM goals WHERE user_id = $1 AND status = 'active'", [user.id]);
  if (Number(count[0]?.c) >= 12) throw new UserFacingError("You can have up to 12 active jars.");

  const id = newId();
  const auto = input.autoAmount && input.autoInterval;
  await query(
    `INSERT INTO goals (id, user_id, name, emoji, target_usd, asset_id, economic_id, asset_symbol, asset_name, asset_icon, asset_decimals,
                        deadline, auto_amount, auto_interval, next_run_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id, user.id, input.name, input.emoji, input.targetUsd, asset.id, asset.economic_asset_id, asset.symbol, asset.name,
      asset.image?.small ?? null, asset.decimals, input.deadline ?? null,
      auto ? input.autoAmount : null, auto ? input.autoInterval : null,
      auto ? nextRun(new Date(), input.autoInterval!) : null,
    ],
  );
  return ok({ id }, 201);
});
