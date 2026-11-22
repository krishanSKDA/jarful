import { config } from "./env";

/**
 * Tiny SQL layer with one interface and two engines:
 *  - Postgres (DATABASE_URL set) for production, e.g. Neon / Supabase / Railway
 *  - PGlite (embedded Postgres in WASM) for zero-setup local development
 * Both use $1-style parameters, so queries are written once.
 */

type Row = Record<string, unknown>;
type Engine = { query: (text: string, params: unknown[]) => Promise<Row[]> };

const g = globalThis as unknown as { __jarDb?: Promise<Engine> };

async function connect(): Promise<Engine> {
  let engine: Engine;
  if (config.databaseUrl) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(config.databaseUrl, {
      max: 5,
      idle_timeout: 20,
      prepare: false, // works behind transaction poolers (Neon/Supabase)
      types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } } as never,
    });
    engine = { query: async (text, params) => (await sql.unsafe(text, params as never[])) as unknown as Row[] };
  } else {
    // Serverless hosts have a read-only, throwaway filesystem: an embedded database would lose every account.
    if (process.env.VERCEL) throw new Error("DATABASE_URL is not set. Add a Postgres database (e.g. Neon) to this deployment.");
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const dir = resolve(config.pgliteDir);
    mkdirSync(dir, { recursive: true });
    const db = new PGlite(dir);
    await db.waitReady;
    engine = { query: async (text, params) => (await db.query<Row>(text, params)).rows };
  }
  await migrate(engine);
  return engine;
}

function db(): Promise<Engine> {
  if (!g.__jarDb) g.__jarDb = connect().catch((e) => ((g.__jarDb = undefined), Promise.reject(e)));
  return g.__jarDb;
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await db()).query(text, params) as Promise<T[]>;
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  return ((await query<T>(text, params))[0] ?? null) as T | null;
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
     id            uuid PRIMARY KEY,
     email         text NOT NULL UNIQUE,
     name          text NOT NULL,
     password_hash text NOT NULL,
     tm_user_id    text UNIQUE,
     solana_address text,
     evm_address   text,
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS goals (
     id              uuid PRIMARY KEY,
     user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name            text NOT NULL,
     emoji           text NOT NULL DEFAULT '🎯',
     target_usd      numeric NOT NULL,
     asset_id        text NOT NULL,
     economic_id     text NOT NULL,
     asset_symbol    text NOT NULL,
     asset_name      text NOT NULL,
     asset_icon      text,
     asset_decimals  int NOT NULL,
     deadline        date,
     auto_amount     numeric,
     auto_interval   text,
     next_run_at     timestamptz,
     status          text NOT NULL DEFAULT 'active',
     created_at      timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS goals_user_idx ON goals(user_id)`,
  `CREATE INDEX IF NOT EXISTS goals_due_idx ON goals(next_run_at) WHERE auto_amount IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS contributions (
     id          uuid PRIMARY KEY,
     goal_id     uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
     user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     order_id    text UNIQUE,
     side        text NOT NULL,
     source      text NOT NULL DEFAULT 'manual',
     usd_amount  numeric,
     qty         numeric,
     est_qty     numeric,
     status      text NOT NULL,
     error       text,
     created_at  timestamptz NOT NULL DEFAULT now(),
     updated_at  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS contributions_goal_idx ON contributions(goal_id, created_at DESC)`,
  // Demo accounts: simulated cash, no Gateway user, deleted after a day.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_cash numeric`,
  `CREATE INDEX IF NOT EXISTS users_demo_idx ON users(created_at) WHERE is_demo`,
];

async function migrate(engine: Engine) {
  for (const m of MIGRATIONS) await engine.query(m, []);
}
