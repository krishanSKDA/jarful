# Jarful

**Give every goal its own jar.** Jarful is goal-based investing: name something you're saving for, pick what it grows in (S&P 500, Nasdaq, gold, Apple, NVIDIA, Solana…), and fill the jar a few dollars at a time, with one tap or on autopilot. Each jar fills visibly as its value approaches the target.

Built on the [True Markets Gateway API](https://docs.truemarkets.co/gateway/). Every account gets its own non-custodial wallet, and every buy settles on-chain.

## What it does

| Feature | Gateway API used |
|---|---|
| Sign-up creates a wallet (Solana + EVM) for each customer | `POST /v1/account/organizations/{org}/users` |
| Deposit screen with QR code; live cash balance | `GET /v1/gateway/balances` |
| Asset picker with live prices, 24h change, sparklines | `GET /v1/gateway/assets`, market data `prices/history/batch` |
| Live price preview as you type an amount | `POST /v1/gateway/quotes` |
| One-tap "Add $10 to jar": create, sign, execute, then track until settled | `POST /v1/gateway/orders`, `/orders/{id}/execute`, `GET /orders/{id}` |
| Auto-invest: daily / weekly / monthly scheduled buys | same order flow, run by cron |
| Cash out a jar back to USDC | market sell via `/orders` |
| Price chart (day / week / month) on each jar | market data `prices/history` |
| On-chain activity feed with explorer links | `GET /v1/gateway/transactions` |

## Production details

- **Keys stay on the server.** The org API key mints short-lived tokens (ES256), which are cached and re-minted before they expire. The signer key stamps each order payload (P-256). Neither key ever reaches the browser.
- **No untracked orders.** Each order is recorded *before* it is executed. Settlement is then polled and the executed quantity stored.
- **Auto-invest can't double-buy.** Each due jar is claimed atomically, so overlapping cron runs are safe. Skipped runs (e.g. not enough cash) appear in the jar's history with the reason.
- **Readable errors.** Gateway error codes (`insufficient_balance`, `quote_stale`, `country_restricted`, rate limits) map to sentences the user can act on.
- **Security:** bcrypt passwords, signed httpOnly session cookies, same-origin checks on every write, rate-limited auth, zod input validation, per-order min/max limits, and security headers.
- **Health check:** `GET /api/health` checks the database and the True Markets token.
- **Accessibility:** keyboard focus rings, aria labels on the jars and charts, and reduced-motion support. Responsive down to 360px.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in SESSION_SECRET, TM key, signer key
npm run dev
```

With `DATABASE_URL` unset, the app uses an embedded Postgres (PGlite) in `.data/`, so no database setup is needed.

To generate a signer key, run `node scripts/new-signer-key.mjs`. **Back it up:** Gateway users stay bound to the signer key that created them.

## Deploy (Vercel + Neon)

1. Create a free Postgres database at [neon.tech](https://neon.tech) and copy its connection string.
2. Push this repo to GitHub and import it in [Vercel](https://vercel.com/new).
3. Add these environment variables:
   - `SESSION_SECRET`: 32+ random characters
   - `TM_API_KEY_JSON`: contents of the org API key file
   - `TM_SIGNER_PRIVATE_KEY`: 64 hex characters
   - `DATABASE_URL`: the Neon connection string
   - `CRON_SECRET`: random string
4. Deploy. Tables are created automatically on first request. `vercel.json` schedules auto-invest daily, and Vercel sends `CRON_SECRET` with each call.

## Stack

Next.js 16 (App Router, route handlers), React 19, TypeScript, Tailwind CSS 4, Postgres / PGlite, jose, bcryptjs, zod.

> Investments can lose value. Every trade is a real on-chain transaction. Tokenized stocks aren't offered in the US or UK.
