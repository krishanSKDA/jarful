import { dayHistories, listAssets, type TmAsset } from "./tm";

/** Funding is USDC on Solana, so Jarful offers the Solana spot assets it can buy with it. */
export const FUNDING = { symbol: "USDC", chain: "solana" } as const;

/** Hand-picked, goal-friendly assets shown first. Everything else is behind search. */
export const FEATURED: { symbol: string; blurb: string }[] = [
  { symbol: "SPYX", blurb: "The 500 largest US companies in one holding" },
  { symbol: "QQQX", blurb: "The 100 biggest Nasdaq companies" },
  { symbol: "GLDX", blurb: "Tracks the price of gold" },
  { symbol: "AAPLX", blurb: "Apple stock" },
  { symbol: "NVDAX", blurb: "NVIDIA stock" },
  { symbol: "MSFTX", blurb: "Microsoft stock" },
  { symbol: "GOOGLX", blurb: "Alphabet (Google) stock" },
  { symbol: "AMZNX", blurb: "Amazon stock" },
  { symbol: "TSLAX", blurb: "Tesla stock" },
  { symbol: "SOL", blurb: "Solana, the network Jarful runs on" },
  { symbol: "JUP", blurb: "Jupiter, Solana's largest exchange" },
  { symbol: "RENDER", blurb: "Decentralised GPU rendering" },
];

export type CatalogAsset = {
  id: string;
  economicId: string;
  symbol: string;
  name: string;
  assetClass: "crypto" | "stock";
  icon: string | null;
  decimals: number;
  blurb: string | null;
  featured: boolean;
  price: number | null;
  change24h: number | null;
  spark: number[];
};

function tradableOnSolana(a: TmAsset) {
  return a.chain === FUNDING.chain && a.venue === "defi" && a.type === "spot" && a.status === "active" && a.tradeable && !a.stable;
}

export async function solanaAssets(): Promise<TmAsset[]> {
  return (await listAssets()).filter(tradableOnSolana);
}

export async function fundingAsset(): Promise<TmAsset | undefined> {
  return (await listAssets()).find((a) => a.symbol === FUNDING.symbol && a.chain === FUNDING.chain && a.venue === "defi");
}

export async function findAsset(assetId: string): Promise<TmAsset | undefined> {
  return (await solanaAssets()).find((a) => a.id === assetId);
}

/** Catalog with 24h prices. `scope: "featured"` keeps the response small for pickers and the landing page. */
export async function catalog(scope: "featured" | "all" = "featured"): Promise<CatalogAsset[]> {
  const assets = await solanaAssets();
  const featuredOrder = new Map(FEATURED.map((f, i) => [f.symbol, i]));
  const chosen =
    scope === "featured"
      ? assets.filter((a) => featuredOrder.has(a.symbol)).sort((a, b) => featuredOrder.get(a.symbol)! - featuredOrder.get(b.symbol)!)
      : [...assets].sort((a, b) => {
          const fa = featuredOrder.get(a.symbol) ?? 999;
          const fb = featuredOrder.get(b.symbol) ?? 999;
          return fa - fb || a.symbol.localeCompare(b.symbol);
        });

  const histories = await dayHistories(chosen.map((a) => a.economic_asset_id));
  return chosen.map((a) => {
    const pts = (histories.get(a.economic_asset_id) ?? []).map((p) => Number(p.price)).filter((n) => Number.isFinite(n) && n > 0);
    const price = pts.at(-1) ?? null;
    const first = pts[0];
    return {
      id: a.id,
      economicId: a.economic_asset_id,
      symbol: a.symbol,
      name: a.name,
      assetClass: a.asset_class,
      icon: a.image?.small ?? null,
      decimals: a.decimals,
      blurb: FEATURED.find((f) => f.symbol === a.symbol)?.blurb ?? null,
      featured: featuredOrder.has(a.symbol),
      price,
      change24h: price && first ? (price - first) / first : null,
      spark: pts,
    };
  });
}

/** Latest price per economic id (from the 24h batch). */
export async function latestPrices(economicIds: string[]): Promise<Map<string, number>> {
  const h = await dayHistories(economicIds);
  const out = new Map<string, number>();
  h.forEach((pts, id) => {
    const last = Number(pts.at(-1)?.price);
    if (Number.isFinite(last) && last > 0) out.set(id, last);
  });
  return out;
}
