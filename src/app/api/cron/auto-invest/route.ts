import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { config } from "@/lib/env";
import { runDueAutoInvests } from "@/lib/goals";

export const maxDuration = 60;

/** Called by a scheduler (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export async function GET(req: NextRequest) {
  const secret = config.cronSecret;
  if (!secret) return fail("CRON_SECRET is not configured.", 503);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return fail("Unauthorized.", 401);
  const results = await runDueAutoInvests();
  return ok({ ran: results.length, results });
}
