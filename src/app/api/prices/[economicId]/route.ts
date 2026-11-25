import { fail, ok, route } from "@/lib/api";
import { priceHistory } from "@/lib/tm";

type Ctx = { params: Promise<{ economicId: string }> };

const RANGES: Record<string, { window: string; resolution: string }> = {
  "1d": { window: "24h", resolution: "15m" },
  "1w": { window: "7d", resolution: "2h" },
  "1m": { window: "30d", resolution: "12h" },
};

export const GET = route<Ctx>(async (req, { params }) => {
  const { economicId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(economicId)) return fail("Unknown asset.", 404);
  const key = req.nextUrl.searchParams.get("range") ?? "1w";
  const range = RANGES[key] ?? RANGES["1w"];
  let points = (await priceHistory(economicId, range.window, range.resolution).catch(() => ({ points: [] }))).points ?? [];
  // The day view goes blank when the feed has a gap; show the latest day of the weekly series instead.
  if (!points.length && key === "1d") points = ((await priceHistory(economicId, "7d", "2h").catch(() => ({ points: [] }))).points ?? []).slice(-12);
  return ok(
    { points: points.map((p) => ({ t: p.t, p: Number(p.price) })).filter((p) => p.p > 0) },
  );
});
