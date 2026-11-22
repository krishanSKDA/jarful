import { clientIp, ok, rateLimit, route } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { createDemoAccount } from "@/lib/demo";

/** Start a fresh demo account (simulated cash, sample jars) and sign the visitor into it. */
export const POST = route(async (req) => {
  rateLimit(`demo:${clientIp(req)}`, 6, 60_000);
  const userId = await createDemoAccount();
  await startSession(userId);
  return ok({ ok: true }, 201);
});
