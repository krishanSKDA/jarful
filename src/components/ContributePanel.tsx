"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { price, qty, usd } from "@/lib/format";

type Quote = { qty: number; price: number; fee: number };
type Phase = { kind: "idle" } | { kind: "placing" } | { kind: "settling"; id: string } | { kind: "done"; qty: number | null } | { kind: "error"; message: string };

/** Polls a contribution until it settles. */
async function waitForSettle(id: string, signal: AbortSignal) {
  for (let i = 0; i < 45 && !signal.aborted; i++) {
    const r = await fetch(`/api/contributions/${id}`, { signal }).catch(() => null);
    const c = r?.ok ? (await r.json()).contribution : null;
    if (c && ["complete", "failed", "canceled"].includes(c.status)) return c;
    await new Promise((res) => setTimeout(res, i < 10 ? 1500 : 4000));
  }
  return null;
}

export function ContributePanel({
  goalId,
  assetId,
  symbol,
  cash,
  suggested,
  minOrder,
  maxOrder,
  demo = false,
}: {
  demo?: boolean;
  goalId: string;
  assetId: string;
  symbol: string;
  cash: number | null;
  suggested: number | null;
  minOrder: number;
  maxOrder: number;
}) {
  const router = useRouter();
  const presets = [...new Set([5, 10, 25, ...(suggested && suggested <= maxOrder ? [suggested] : [])])].sort((a, b) => a - b);
  const [amount, setAmount] = useState(String(presets[1] ?? 10));
  const [quoted, setQuoted] = useState<{ key: string; quote?: Quote; err?: string } | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);
  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= minOrder && value <= maxOrder;
  const short = cash !== null && valid && value > cash;
  const quoteKey = `${assetId}:${value}`;
  // Only show a quote that matches the amount on screen.
  const quote = quoted?.key === quoteKey ? (quoted.quote ?? null) : null;
  const quoteErr = quoted?.key === quoteKey ? (quoted.err ?? null) : null;

  // Debounced live quote.
  useEffect(() => {
    if (!valid) return;
    const key = `${assetId}:${value}`;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const r = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, usd: value }),
        signal: ctrl.signal,
      }).catch(() => null);
      if (!r) return;
      const j = await r.json().catch(() => ({}));
      setQuoted(r.ok ? { key, quote: j } : { key, err: j.error ?? "No price right now." });
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [assetId, value, valid]);

  useEffect(() => () => abort.current?.abort(), []);

  async function buy() {
    setPhase({ kind: "placing" });
    const r = await fetch(`/api/goals/${goalId}/contribute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usd: value }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setPhase({ kind: "error", message: j.error ?? "Can't reach Jarful. Check your connection." });
      return;
    }
    let c = j.contribution;
    if (c.status !== "complete") {
      setPhase({ kind: "settling", id: c.id });
      abort.current = new AbortController();
      c = (await waitForSettle(c.id, abort.current.signal)) ?? c;
    }
    if (c.status === "failed" || c.status === "canceled") {
      setPhase({ kind: "error", message: c.error ?? "The trade didn't go through. Nothing was spent." });
    } else {
      const got = Number(c.qty ?? c.est_qty);
      setPhase({ kind: "done", qty: Number.isFinite(got) && got > 0 ? got : null });
    }
    router.refresh();
  }

  const busy = phase.kind === "placing" || phase.kind === "settling";

  return (
    <section className="panel p-6" aria-labelledby="add-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="add-heading" className="font-display text-2xl font-semibold">
          Add to this jar
        </h2>
        <Link href="/app/wallet" className="num text-sm text-muted hover:text-ink">
          {cash === null ? "Cash unavailable" : `${usd(cash)} cash`}
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => setAmount(String(p))}
            aria-pressed={value === p}
            className={`num rounded-full border px-4 py-1.5 text-sm font-semibold ${value === p ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}
          >
            ${p}
            {p === suggested && <span className="ml-1 font-normal opacity-75">on track</span>}
          </button>
        ))}
      </div>

      <label htmlFor="amount" className="sr-only">
        Amount in dollars
      </label>
      <div className="relative mt-3">
        <span className="font-display pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-muted">$</span>
        <input
          id="amount"
          type="number"
          inputMode="decimal"
          min={minOrder}
          max={maxOrder}
          step="any"
          value={amount}
          disabled={busy}
          onChange={(e) => setAmount(e.target.value)}
          className="field font-display num pl-9 text-3xl font-semibold"
        />
      </div>

      <div className="mt-3 min-h-[44px] text-sm" aria-live="polite">
        {!valid ? (
          <span className="text-muted">
            Choose between {usd(minOrder)} and {usd(maxOrder, { cents: false })}.
          </span>
        ) : quoteErr ? (
          <span className="text-loss">{quoteErr}</span>
        ) : quote ? (
          <span className="text-muted">
            You get about <strong className="num text-ink">{qty(quote.qty, symbol)}</strong> at {price(quote.price)}. Fee {usd(quote.fee)}.
          </span>
        ) : (
          <span className="text-muted">Getting a live price…</span>
        )}
        {short && (
          <div className="mt-1 text-loss">{demo ? "That's more than your demo cash. Cash out a jar to free some up." : "That's more than your cash. Add USDC in your wallet first."}</div>
        )}
      </div>

      <button type="button" onClick={buy} disabled={!valid || busy || short} className="btn btn-primary mt-2 w-full py-3 text-lg">
        {busy && <span className="spinner" aria-hidden />}
        {phase.kind === "placing" ? "Buying…" : phase.kind === "settling" ? (demo ? "Settling (demo)…" : "Settling on-chain…") : `Add ${valid ? usd(value) : ""} to jar`}
      </button>

      {phase.kind === "done" && (
        <p role="status" className="mt-3 rounded-xl bg-cobalt-soft px-3 py-2 text-sm">
          Added{phase.qty ? ` ${qty(phase.qty, symbol)}` : ""} to your jar.
        </p>
      )}
      {phase.kind === "error" && (
        <p role="alert" className="mt-3 rounded-xl bg-[color-mix(in_srgb,var(--loss)_10%,white)] px-3 py-2 text-sm text-loss">
          {phase.message}
        </p>
      )}
    </section>
  );
}
