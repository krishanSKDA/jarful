import { ok, route } from "@/lib/api";
import { catalog } from "@/lib/catalog";

/** Public: assets Jarful can buy, with 24h prices. ?scope=all includes everything on Solana. */
export const GET = route(async (req) => {
  const scope = req.nextUrl.searchParams.get("scope") === "all" ? "all" : "featured";
  return ok({ assets: await catalog(scope) });
});
