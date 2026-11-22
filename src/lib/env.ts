import { readFileSync } from "node:fs";
import type { JsonWebKey } from "node:crypto";

/** Server-side configuration. Never import this from a client component. */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

export type OrgApiKey = { key_id: string; private_key: JsonWebKey };

let cachedKey: OrgApiKey | null = null;
/** The organization API key: TM_API_KEY_JSON (raw or base64 JSON) or TM_KEY_FILE (path). */
export function orgApiKey(): OrgApiKey {
  if (cachedKey) return cachedKey;
  let raw = process.env.TM_API_KEY_JSON;
  if (!raw && process.env.TM_KEY_FILE) raw = readFileSync(process.env.TM_KEY_FILE, "utf8");
  if (!raw) throw new Error("Set TM_API_KEY_JSON or TM_KEY_FILE. See .env.example.");
  raw = raw.trim();
  if (!raw.startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.key_id || !parsed.private_key) throw new Error("Organization API key is missing key_id or private_key.");
  cachedKey = { key_id: parsed.key_id, private_key: parsed.private_key };
  return cachedKey;
}

/** The signer private key (64 hex chars): TM_SIGNER_PRIVATE_KEY or TM_SIGNER_KEY_FILE. */
export function signerPrivateKeyHex(): string {
  let hex = process.env.TM_SIGNER_PRIVATE_KEY;
  if (!hex && process.env.TM_SIGNER_KEY_FILE) {
    hex = JSON.parse(readFileSync(process.env.TM_SIGNER_KEY_FILE, "utf8")).signer_private_key;
  }
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex.trim())) {
    throw new Error("Set TM_SIGNER_PRIVATE_KEY (64 hex chars) or TM_SIGNER_KEY_FILE. See .env.example.");
  }
  return hex.trim().toLowerCase();
}

export const config = {
  apiBase: process.env.TM_API_BASE ?? "https://api.truemarkets.co",
  sessionSecret: () => {
    const s = required("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
    return s;
  },
  // Neon's Vercel integration sets DATABASE_URL; Vercel Postgres sets POSTGRES_URL.
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  pgliteDir: process.env.PGLITE_DIR ?? ".data/pglite",
  cronSecret: process.env.CRON_SECRET,
  minOrderUsd: Number(process.env.MIN_ORDER_USD ?? 1),
  maxOrderUsd: Number(process.env.MAX_ORDER_USD ?? 250),
  /** Prefix for external_ref_id so users from this app are identifiable in the TM dashboard. */
  externalRefPrefix: process.env.TM_EXTERNAL_REF_PREFIX ?? "jarful",
};
