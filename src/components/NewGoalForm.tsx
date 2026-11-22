"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Jar } from "./Jar";
import type { CatalogAsset } from "@/lib/catalog";
import { pct, price, untilLabel, usd, weeksUntil } from "@/lib/format";

/** Earliest selectable target date: tomorrow (YYYY-MM-DD). */
function tomorrow() {
  return new Date(Date.now() + 864e5).toISOString().slice(0, 10);
}

const EMOJI = ["💻", "🗾", "🛟", "🚗", "🏠", "🎸", "💍", "🎓", "🚲", "🐶", "🌴", "🎁"];
type Interval = "daily" | "weekly" | "monthly";
const PER_WEEK: Record<Interval, number> = { daily: 7, weekly: 1, monthly: 12 / 52 };

export function NewGoalForm({ featured, minOrder, maxOrder }: { featured: CatalogAsset[]; minOrder: number; maxOrder: number }) {
  const router = useRouter();
  const [emoji, setEmoji] = useState(EMOJI[0]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("500");
  const [assetId, setAssetId] = useState(featured[0]?.id ?? "");
  const [deadline, setDeadline] = useState("");
  const [auto, setAuto] = useState(false);
  const [autoAmount, setAutoAmount] = useState("");
  const [interval, setInterval] = useState<Interval>("weekly");
  const [all, setAll] = useState<CatalogAsset[] | null>(null);
  const [search, setSearch] = useState("");
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targetNum = Number(target) || 0;
  const weeksLeft = deadline ? weeksUntil(deadline) : null;
  const suggestedWeekly = weeksLeft && targetNum ? Math.ceil(targetNum / weeksLeft) : null;
  const suggestedPerRun = suggestedWeekly ? Math.min(maxOrder, Math.max(minOrder, Math.ceil(suggestedWeekly / PER_WEEK[interval]))) : null;
  const autoWeekly = (Number(autoAmount) || 0) * PER_WEEK[interval];

  const pool = all ?? featured;
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? pool.filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) : pool;
    return list.slice(0, all ? 60 : 12);
  }, [pool, search, all]);
  const selected = pool.find((a) => a.id === assetId) ?? featured.find((a) => a.id === assetId);

  async function loadAll() {
    setLoadingAll(true);
    const r = await fetch("/api/assets?scope=all").catch(() => null);
    if (r?.ok) setAll((await r.json()).assets);
    setLoadingAll(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        emoji,
        targetUsd: targetNum,
        assetId,
        deadline: deadline || null,
        autoAmount: auto ? Number(autoAmount) : null,
        autoInterval: auto ? interval : null,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      setError(res ? ((await res.json().catch(() => ({}))).error ?? "Couldn't create the jar.") : "Can't reach Jarful. Check your connection.");
      return;
    }
    const { id } = await res.json();
    router.push(`/app/goals/${id}?created=1`);
    router.refresh();
  }

  const today = tomorrow();

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="space-y-8">
        <section className="panel space-y-5 p-6">
          <h2 className="font-display text-2xl font-semibold">What are you saving for?</h2>
          <div>
            <span className="mb-2 block text-sm font-medium">Label</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Jar label">
              {EMOJI.map((em) => (
                <button
                  key={em}
                  type="button"
                  role="radio"
                  aria-checked={emoji === em}
                  onClick={() => setEmoji(em)}
                  className={`flex size-11 items-center justify-center rounded-xl border text-2xl ${emoji === em ? "border-cobalt bg-cobalt-soft" : "border-line hover:border-ink"}`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium">
                Name
              </label>
              <input id="name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="New laptop" className="field" />
            </div>
            <div>
              <label htmlFor="target" className="mb-1 block text-sm font-medium">
                Price tag
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                <input
                  id="target"
                  required
                  inputMode="decimal"
                  type="number"
                  min={5}
                  step="any"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="field num pl-7"
                />
              </div>
            </div>
          </div>
          <div className="sm:w-1/2 sm:pr-2">
            <label htmlFor="deadline" className="mb-1 block text-sm font-medium">
              Target date <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="deadline" type="date" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} className="field" />
            {suggestedWeekly && (
              <p className="mt-1 text-sm text-muted">
                That&apos;s about <strong className="num text-ink">{usd(suggestedWeekly, { cents: false })}</strong> a week for {weeksLeft} weeks.
              </p>
            )}
          </div>
        </section>

        <section className="panel space-y-4 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold">What should it grow in?</h2>
              <p className="text-sm text-muted">Prices are live. You can only pick one asset per jar.</p>
            </div>
            {all && (
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or symbol"
                aria-label="Search assets"
                className="field max-w-xs py-2"
              />
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Asset">
            {shown.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={assetId === a.id}
                onClick={() => setAssetId(a.id)}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${assetId === a.id ? "border-cobalt bg-cobalt-soft" : "border-line hover:border-ink"}`}
              >
                {a.icon ? <Image src={a.icon} alt="" width={28} height={28} className="size-7 rounded-full" unoptimized /> : <span className="size-7 rounded-full bg-porcelain" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{a.name}</span>
                  <span className="block truncate text-xs text-muted">{a.blurb ?? a.symbol}</span>
                </span>
                <span className="num text-right text-xs">
                  <span className="block font-medium">{price(a.price)}</span>
                  <span style={{ color: (a.change24h ?? 0) >= 0 ? "var(--gain)" : "var(--loss)" }}>{pct(a.change24h)}</span>
                </span>
              </button>
            ))}
            {shown.length === 0 && <p className="text-sm text-muted">Nothing matches “{search}”.</p>}
          </div>
          {!all && (
            <button type="button" onClick={loadAll} disabled={loadingAll} className="text-sm font-medium text-cobalt hover:underline">
              {loadingAll ? "Loading…" : "Browse every asset"}
            </button>
          )}
        </section>

        <section className="panel space-y-4 p-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={auto} onChange={(e) => {
              setAuto(e.target.checked);
              if (e.target.checked && !autoAmount) setAutoAmount(String(suggestedPerRun ?? 10));
            }} className="mt-1.5 size-4 accent-[var(--cobalt)]" />
            <span>
              <span className="font-display block text-2xl font-semibold">Fill it automatically</span>
              <span className="text-sm text-muted">Jarful buys on a schedule from your cash. Skipped runs are shown in the jar&apos;s history.</span>
            </span>
          </label>
          {auto && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="autoAmount" className="mb-1 block text-sm font-medium">
                  Amount each time
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                  <input
                    id="autoAmount"
                    type="number"
                    min={minOrder}
                    max={maxOrder}
                    step="any"
                    required
                    value={autoAmount}
                    onChange={(e) => setAutoAmount(e.target.value)}
                    className="field num pl-7"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="interval" className="mb-1 block text-sm font-medium">
                  How often
                </label>
                <select id="interval" value={interval} onChange={(e) => setInterval(e.target.value as Interval)} className="field">
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </select>
              </div>
              {autoWeekly > 0 && targetNum > 0 && (
                <p className="text-sm text-muted sm:col-span-2">
                  At this pace the jar is full in about <strong className="text-ink">{untilLabel(Math.ceil(targetNum / autoWeekly))}</strong>, before any price changes.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="panel flex flex-col items-center gap-4 p-6 text-center">
          <Jar progress={0} emoji={emoji} size={150} animate={false} label="Preview of your new jar" />
          <div>
            <div className="font-display text-xl font-semibold">{name.trim() || "Your new jar"}</div>
            <div className="num text-muted">
              {usd(targetNum, { cents: false })}
              {selected ? ` in ${selected.symbol}` : ""}
            </div>
          </div>
          {error && (
            <p role="alert" className="w-full rounded-xl bg-[color-mix(in_srgb,var(--loss)_10%,white)] px-3 py-2 text-sm text-loss">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || !name.trim() || targetNum < 5 || !assetId} className="btn btn-primary w-full py-3">
            {busy && <span className="spinner" aria-hidden />}
            {busy ? "Making your jar…" : "Make jar"}
          </button>
        </div>
      </aside>
    </form>
  );
}
