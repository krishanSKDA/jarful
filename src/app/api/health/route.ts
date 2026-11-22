import { ok } from "@/lib/api";
import { query } from "@/lib/db";
import { orgToken } from "@/lib/tm";

export async function GET() {
  const checks: Record<string, string> = {};
  await query("SELECT 1").then(() => (checks.database = "ok"), (e) => (checks.database = `error: ${e.message}`));
  await orgToken().then(() => (checks.trueMarkets = "ok"), (e) => (checks.trueMarkets = `error: ${e.message}`));
  const healthy = Object.values(checks).every((v) => v === "ok");
  return ok({ status: healthy ? "ok" : "degraded", checks }, healthy ? 200 : 503);
}
