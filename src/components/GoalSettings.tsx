"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usd } from "@/lib/format";

type Interval = "daily" | "weekly" | "monthly";
const LABEL: Record<Interval, string> = { daily: "every day", weekly: "every week", monthly: "every month" };

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  if (!r) return "Can't reach Jarful. Check your connection.";
  if (!r.ok) return (await r.json().catch(() => ({}))).error ?? "That didn't work. Try again.";
  return null;
}

export function AutoInvest({
  goalId,
  amount,
  interval,
  nextRun,
  suggested,
}: {
  goalId: string;
  amount: number | null;
  interval: Interval | null;
  nextRun: string | null;
  suggested: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [amt, setAmt] = useState(String(amount ?? suggested ?? 10));
  const [iv, setIv] = useState<Interval>(interval ?? "weekly");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(off = false) {
    setBusy(true);
    setError(null);
    const err = await send(`/api/goals/${goalId}`, "PATCH", off ? { autoAmount: null } : { autoAmount: Number(amt), autoInterval: iv });
    setBusy(false);
    if (err) return setError(err);
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="panel p-6">
      <h2 className="font-display text-2xl font-semibold">Auto-invest</h2>
      {!editing ? (
        <>
          <p className="mt-2 text-muted">
            {amount && interval ? (
              <>
                Buying <strong className="num text-ink">{usd(amount)}</strong> {LABEL[interval]}.
                {nextRun && <> Next buy {new Date(nextRun).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}.</>}
              </>
            ) : (
              "Off. Turn it on and Jarful tops this jar up from your cash on a schedule."
            )}
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn btn-quiet px-4 py-2 text-sm" onClick={() => setEditing(true)}>
              {amount ? "Change" : "Turn on"}
            </button>
            {amount && (
              <button type="button" className="btn btn-quiet px-4 py-2 text-sm" disabled={busy} onClick={() => save(true)}>
                Turn off
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="auto-amt" className="mb-1 block text-sm font-medium">
                Amount
              </label>
              <input id="auto-amt" type="number" min={1} step="any" value={amt} onChange={(e) => setAmt(e.target.value)} className="field num" />
            </div>
            <div>
              <label htmlFor="auto-iv" className="mb-1 block text-sm font-medium">
                How often
              </label>
              <select id="auto-iv" value={iv} onChange={(e) => setIv(e.target.value as Interval)} className="field">
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-loss">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary px-4 py-2 text-sm" disabled={busy} onClick={() => save()}>
              Save schedule
            </button>
            <button type="button" className="btn btn-quiet px-4 py-2 text-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Cash out / delete with an inline second step instead of a browser dialog. */
export function JarActions({ goalId, value, symbol, hasHoldings }: { goalId: string; value: number; symbol: string; hasHoldings: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"withdraw" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(kind: "withdraw" | "delete") {
    setBusy(true);
    setMsg(null);
    const err = kind === "withdraw" ? await send(`/api/goals/${goalId}/withdraw`, "POST", {}) : await send(`/api/goals/${goalId}`, "DELETE");
    setBusy(false);
    setConfirm(null);
    if (err) return setMsg({ ok: false, text: err });
    if (kind === "delete") {
      router.push("/app");
      router.refresh();
      return;
    }
    setMsg({ ok: true, text: "Sold. The cash is back in your wallet once it settles." });
    router.refresh();
  }

  return (
    <section className="panel p-6">
      <h2 className="font-display text-2xl font-semibold">Done saving?</h2>
      <p className="mt-2 text-muted">
        {hasHoldings ? `Cash out sells the ${symbol} in this jar (about ${usd(value)}) and returns USDC to your wallet.` : "This jar is empty. You can delete it."}
      </p>
      {confirm ? (
        <div className="mt-4 rounded-xl bg-porcelain p-4">
          <p className="text-sm font-medium">{confirm === "withdraw" ? `Sell everything in this jar at the current price?` : "Delete this jar? Its history goes with it."}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-danger px-4 py-2 text-sm" disabled={busy} onClick={() => run(confirm)}>
              {busy && <span className="spinner" aria-hidden />}
              {confirm === "withdraw" ? "Yes, cash out" : "Yes, delete jar"}
            </button>
            <button type="button" className="btn btn-quiet px-4 py-2 text-sm" disabled={busy} onClick={() => setConfirm(null)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {hasHoldings ? (
            <button type="button" className="btn btn-quiet px-4 py-2 text-sm" onClick={() => setConfirm("withdraw")}>
              Cash out
            </button>
          ) : (
            <button type="button" className="btn btn-danger px-4 py-2 text-sm" onClick={() => setConfirm("delete")}>
              Delete jar
            </button>
          )}
        </div>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-sm ${msg.ok ? "text-gain" : "text-loss"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
