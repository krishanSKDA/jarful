import { z } from "zod";
import { authed, body, fail, ok } from "@/lib/api";
import { ensureProvisioned } from "@/lib/auth";
import { findAsset } from "@/lib/catalog";
import { config } from "@/lib/env";
import { getQuote } from "@/lib/tm";

const Schema = z.object({ assetId: z.string().uuid(), usd: z.number().positive() });

/** Live price preview for a buy: how many units `usd` gets, and the fee. */
export const POST = authed(async (req, _ctx, userIn) => {
  const { assetId, usd } = await body(req, Schema);
  if (usd < config.minOrderUsd || usd > config.maxOrderUsd) return fail(`Choose an amount between $${config.minOrderUsd} and $${config.maxOrderUsd}.`);
  if (!(await findAsset(assetId))) return fail("That asset isn't available.", 404);
  const user = await ensureProvisioned(userIn);
  const q = await getQuote(user.tm_user_id!, assetId, usd.toFixed(2), "buy");
  return ok({ qty: Number(q.qty), price: Number(q.price), fee: Number(q.fee), notional: Number(q.notional) });
});
