import { z } from "zod";
import { authed, body, ok, rateLimit } from "@/lib/api";
import { convertToUsdc } from "@/lib/goals";

const Schema = z.object({ assetId: z.string().uuid() });

/** Convert another dollar stablecoin in the wallet (e.g. PYUSD) into USDC, which is what buys spend. */
export const POST = authed(async (req, _ctx, user) => {
  rateLimit(`convert:${user.id}`, 5, 60_000);
  const { assetId } = await body(req, Schema);
  return ok(await convertToUsdc(user, assetId));
});
