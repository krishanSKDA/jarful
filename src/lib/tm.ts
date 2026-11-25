import { createECDH, createPrivateKey, sign, type KeyObject } from "node:crypto";
import { config, orgApiKey, signerPrivateKeyHex } from "./env";

/**
 * True Markets Gateway client.
 * Docs: https://docs.truemarkets.co/gateway/
 *
 * Two keys are involved:
 *  - the organization API key mints a bearer token (ES256 over `${key_id}.${timestamp}`)
 *  - the signer key approves each wallet transaction (P-256 stamp over the payload)
 */

export class TmError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- org token

type TokenState = { token: string; orgId: string; expiresAt: number };
const g = globalThis as unknown as { __tmToken?: TokenState; __tmMinting?: Promise<TokenState> };

async function mintToken(): Promise<TokenState> {
  const { key_id, private_key } = orgApiKey();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign("sha256", Buffer.from(`${key_id}.${timestamp}`), {
    key: createPrivateKey({ key: private_key, format: "jwk" }),
    dsaEncoding: "ieee-p1363", // r||s, which the API expects
  }).toString("base64url");

  const res = await fetch(`${config.apiBase}/v1/auth/api-key/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key_id, timestamp, signature }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new TmError(res.status, json.code ?? json.type ?? "token_failed", json.message ?? "Could not mint org token", json.request_id);
  }
  const claims = JSON.parse(Buffer.from(json.access_token.split(".")[1], "base64url").toString());
  const expiresAt = typeof claims.exp === "number" ? claims.exp * 1000 : Date.now() + 55 * 60_000;
  return { token: json.access_token, orgId: claims.tm.organization_id, expiresAt };
}

/** A valid org token, re-minted 5 minutes before expiry. Concurrent callers share one mint. */
export async function orgToken(): Promise<TokenState> {
  const cur = g.__tmToken;
  if (cur && cur.expiresAt - Date.now() > 5 * 60_000) return cur;
  if (!g.__tmMinting) {
    g.__tmMinting = mintToken()
      .then((t) => (g.__tmToken = t))
      .finally(() => (g.__tmMinting = undefined));
  }
  return g.__tmMinting;
}

// ---------------------------------------------------------------- requests

type CallOpts = { body?: unknown; userId?: string; auth?: boolean; revalidate?: number };

export async function tm<T = unknown>(method: string, path: string, opts: CallOpts = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) headers.Authorization = `Bearer ${(await orgToken()).token}`;
  if (opts.userId) headers["TM-On-Behalf-Of"] = opts.userId;

  const res = await fetch(`${config.apiBase}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    ...(opts.revalidate ? { next: { revalidate: opts.revalidate } } : { cache: "no-store" as const }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A stale token (e.g. server clock drift): drop it so the next call re-mints.
    if (res.status === 401) g.__tmToken = undefined;
    throw new TmError(res.status, json.code ?? json.type ?? "error", json.message ?? `Request failed (${res.status})`, json.request_id);
  }
  return json as T;
}

// ---------------------------------------------------------------- signer

type Signer = { key: KeyObject; publicKey: string };
let signer: Signer | null = null;

function getSigner(): Signer {
  if (signer) return signer;
  const hex = signerPrivateKeyHex();
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(hex, "hex"));
  const point = ecdh.getPublicKey(); // 0x04 || x || y
  const key = createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      d: Buffer.from(hex, "hex").toString("base64url"),
      x: point.subarray(1, 33).toString("base64url"),
      y: point.subarray(33).toString("base64url"),
    },
  });
  signer = { key, publicKey: ecdh.getPublicKey("hex", "compressed") };
  return signer;
}

export function signerPublicKey(): string {
  return getSigner().publicKey;
}

/** Stamp one payload exactly as returned by the API (never re-serialize it). */
export function stamp(payload: string): string {
  const { key, publicKey } = getSigner();
  const signature = sign("sha256", Buffer.from(payload), key).toString("hex");
  return Buffer.from(JSON.stringify({ publicKey, signature, scheme: "SIGNATURE_SCHEME_TK_API_P256" })).toString("base64url");
}

// ---------------------------------------------------------------- domain types

export type TmAsset = {
  id: string;
  economic_asset_id: string;
  chain: string | null;
  address: string | null;
  symbol: string;
  name: string;
  decimals: number;
  status: string;
  tradeable: boolean;
  stable: boolean;
  venue: "defi" | "cefi";
  type: "spot" | "perp";
  asset_class: "crypto" | "stock";
  description?: string;
  website?: string;
  image?: { thumb: string; small: string; large: string };
  order_types: string[];
};

export type TmUser = {
  user_id: string;
  external_ref_id: string;
  created_at: string;
  wallets: { address: string; chain_family: "solana" | "evm" }[];
};

export type TmOrderStatus = "initialized" | "pending" | "cancel_pending" | "complete" | "canceled" | "active" | "failed";

export type TmOrderCreated = {
  order_id: string;
  status: TmOrderStatus | "";
  venue: string;
  payloads?: { digest: string; payload: string }[];
  quote?: { base_asset?: string; quote_asset?: string; qty: string; qty_out: string; fee: string; fee_asset: string; issues?: string[] };
};

export type TmOrder = {
  order_id?: string;
  id?: string;
  status: TmOrderStatus;
  executed_qty?: string;
  executed_vwap?: string;
  fee?: string;
  [k: string]: unknown;
};

export type TmBalance = { asset_id: string; symbol: string; chain: string | null; venue: string; available: string; total: string; stable?: boolean; decimals?: number };

export type TmTransaction = {
  id: string;
  type: "order" | "transfer" | "ramp" | "received_transfer";
  asset_flow: "in" | "out";
  status: string;
  created_at: string;
  completed_at: string | null;
  qty: string | null;
  asset_id: string | null;
  asset_symbol: string;
  tx_hash: string | null;
  explorer_url: string | null;
  failure_reason: string | null;
  order?: { side: string; qty: string; qty_unit: string; executed_qty?: string; executed_vwap?: string; fee?: string; status: string };
};

// ---------------------------------------------------------------- endpoints

const assetsCache: { at: number; data: TmAsset[] } = { at: 0, data: [] };

export async function listAssets(): Promise<TmAsset[]> {
  if (Date.now() - assetsCache.at < 10 * 60_000 && assetsCache.data.length) return assetsCache.data;
  const { data } = await tm<{ data: TmAsset[] }>("GET", "/v1/gateway/assets?asset_class=crypto,stock", { auth: false });
  assetsCache.data = data;
  assetsCache.at = Date.now();
  return data;
}

export async function createTmUser(externalRefId: string): Promise<TmUser> {
  const { orgId } = await orgToken();
  for (let attempt = 1; ; attempt++) {
    try {
      const user = await tm<TmUser>("POST", `/v1/account/organizations/${orgId}/users`, {
        body: { external_ref_id: externalRefId, signer_public_key: signerPublicKey() },
      });
      if (user.wallets?.length) return user;
    } catch (err) {
      // 503: wallets not ready yet; the same request finishes them.
      if (!(err instanceof TmError) || err.status !== 503 || attempt >= 6) throw err;
    }
    if (attempt >= 6) throw new TmError(503, "wallets_pending", "Wallets are still being created. Try again shortly.");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export type TmAvailability = { country: string; allowed_product_types: string[]; allowed_asset_classes: string[] };
const availabilityCache: { at: number; data: TmAvailability | null } = { at: 0, data: null };

/**
 * What the Gateway lets this server trade, judged from the server's own location (e.g. tokenized stocks are
 * not offered from the US). Cached 10 minutes; null if it can't be read (callers then don't block anything).
 */
export async function assetAvailability(): Promise<TmAvailability | null> {
  if (availabilityCache.data && Date.now() - availabilityCache.at < 10 * 60_000) return availabilityCache.data;
  const data = await tm<TmAvailability>("GET", "/v1/gateway/assets/availability").catch(() => null);
  if (data?.allowed_asset_classes) Object.assign(availabilityCache, { at: Date.now(), data });
  return data;
}

export function getBalances(userId: string) {
  return tm<{ data: TmBalance[] }>("GET", "/v1/gateway/balances", { userId });
}

export function getQuote(userId: string, assetId: string, qty: string, side: "buy" | "sell") {
  return tm<{ qty: string; price: string; notional: string; fee: string }>("POST", "/v1/gateway/quotes", {
    userId,
    body: { asset_id: assetId, qty, qty_unit: side === "buy" ? "quote" : "base", side },
  });
}

/**
 * Step 1 of a trade: create a market order. Market buys are sized in USDC (quote),
 * market sells in the asset itself (base). Returns payloads that must be signed.
 */
export async function createMarketOrder(userId: string, assetId: string, side: "buy" | "sell", qty: string) {
  const order = await tm<TmOrderCreated>("POST", "/v1/gateway/orders", {
    userId,
    body: { asset_id: assetId, qty, qty_unit: side === "buy" ? "quote" : "base", side, type: "market" },
  });
  if (!order.order_id) {
    // 201 with an empty order_id: nothing was created; quote.issues says why.
    const issue = order.quote?.issues?.join(", ") || "The order could not be created";
    throw new TmError(422, issue.toLowerCase().includes("insufficient") ? "insufficient_balance" : "order_rejected", issue);
  }
  return order;
}

/** Step 2: sign every payload with the signer key and execute right away, before the quote expires. */
export async function executeOrder(userId: string, order: TmOrderCreated) {
  const signatures = (order.payloads ?? []).map((p) => stamp(p.payload));
  return tm<{ status: TmOrderStatus }>("POST", `/v1/gateway/orders/${order.order_id}/execute`, {
    userId,
    body: { signatures, auth_type: "api_key" },
  });
}

export function getOrder(userId: string, orderId: string) {
  return tm<TmOrder>("GET", `/v1/gateway/orders/${orderId}`, { userId });
}

export function listTransactions(userId: string, limit = 50) {
  return tm<{ data: TmTransaction[] }>("GET", `/v1/gateway/transactions?limit=${limit}`, { userId });
}

// ---------------------------------------------------------------- market data (no auth)

export type PricePoint = { t: string; price: string };

export async function priceHistory(economicAssetId: string, window: string, resolution: string) {
  return tm<{ points: PricePoint[] }>(
    "GET",
    `/v1/defi/market/prices/history?asset_id=${economicAssetId}&window=${window}&resolution=${resolution}`,
    { auth: false, revalidate: 60 },
  );
}

const batchCache = new Map<string, { at: number; data: Map<string, PricePoint[]> }>();

/**
 * Recent price history for many assets, keyed by economic_asset_id: the last 24h hourly, or the last
 * ~day of the 7-day series when the feed has a gap. Cached 60s.
 */
export async function dayHistories(economicIds: string[]): Promise<Map<string, PricePoint[]>> {
  const ids = [...new Set(economicIds)].sort();
  const out = new Map<string, PricePoint[]>();
  if (!ids.length) return out;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 40) chunks.push(ids.slice(i, i + 40));
  await Promise.all(
    chunks.map(async (chunk) => {
      const key = chunk.join(",");
      const hit = batchCache.get(key);
      if (hit && Date.now() - hit.at < 60_000) {
        hit.data.forEach((v, k) => out.set(k, v));
        return;
      }
      const batch = (window: string, resolution: string, idList: string[]) =>
        tm<{ results: { asset_id: string; points: PricePoint[] }[] }>(
          "GET",
          `/v1/defi/market/prices/history/batch?asset_ids=${idList.join(",")}&window=${window}&resolution=${resolution}`,
          { auth: false },
        )
          .then((res) => res.results ?? [])
          .catch(() => []);

      const m = new Map<string, PricePoint[]>();
      for (const r of await batch("24h", "1h", chunk)) if (r.points?.length) m.set(r.asset_id, r.points);
      // If the feed has a gap (no points in the last 24h), fall back to the latest week so a jar
      // is valued at its last known price instead of $0. Keep the last 12 points (about a day).
      const missing = chunk.filter((id) => !m.has(id));
      if (missing.length) {
        for (const r of await batch("7d", "2h", missing)) if (r.points?.length) m.set(r.asset_id, r.points.slice(-12));
      }
      if (m.size) batchCache.set(key, { at: Date.now(), data: m });
      m.forEach((v, k) => out.set(k, v));
    }),
  );
  return out;
}
