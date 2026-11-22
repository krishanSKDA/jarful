"use client";

import { useState } from "react";
import { Jar } from "./Jar";
import type { CatalogAsset } from "@/lib/catalog";
import { pct, price, untilLabel, usd, weeksTo } from "@/lib/format";

const GOALS = [
  { label: "A new laptop", emoji: "💻", target: 1200 },
  { label: "A trip to Japan", emoji: "🗾", target: 2500 },
  { label: "An emergency fund", emoji: "🛟", target: 1000 },
  { label: "A first car", emoji: "🚗", target: 6000 },
];

export function LandingCalculator({ assets }: { assets: CatalogAsset[] }) {
  const [goal, setGoal] = useState(GOALS[0]);
  const [weekly, setWeekly] = useState(25);
  const picks = assets.filter((a) => ["SPYX", "GLDX", "AAPLX", "SOL"].includes(a.symbol));
  const [assetId, setAssetId] = useState(picks[0]?.id);
  const asset = picks.find((a) => a.id === assetId);
  const after12 = Math.min(1, (weekly * 13) / goal.target);
  const weeks = weeksTo(goal.target, 0, weekly);

  return (
    <div className="panel relative p-6 sm:p-8">
      <div className="grid gap-8 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="space-y-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-muted">I&apos;m saving for</legend>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => setGoal(g)}
                  aria-pressed={goal.label === g.label}
                  className={`rounded-full border px-3 py-1.5 text-sm ${goal.label === g.label ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}
                >
                  <span aria-hidden>{g.emoji}</span> {g.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="weekly" className="mb-1 flex items-baseline justify-between text-sm font-medium text-muted">
              <span>Adding each week</span>
              <span className="font-display num text-xl font-semibold text-ink">{usd(weekly, { cents: false })}</span>
            </label>
            <input
              id="weekly"
              type="range"
              min={5}
              max={150}
              step={5}
              value={weekly}
              onChange={(e) => setWeekly(Number(e.target.value))}
              className="w-full accent-[var(--cobalt)]"
            />
          </div>

          {picks.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-muted">Growing in</legend>
              <div className="grid grid-cols-2 gap-2">
                {picks.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAssetId(a.id)}
                    aria-pressed={assetId === a.id}
                    className={`rounded-xl border px-3 py-2 text-left ${assetId === a.id ? "border-cobalt bg-cobalt-soft" : "border-line hover:border-ink"}`}
                  >
                    <div className="text-sm font-semibold">{a.name}</div>
                    <div className="num text-xs text-muted">
                      {price(a.price)}{" "}
                      <span style={{ color: (a.change24h ?? 0) >= 0 ? "var(--gain)" : "var(--loss)" }}>{pct(a.change24h)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <Jar progress={after12} emoji={goal.emoji} size={150} animate={false} label={`Jar ${Math.round(after12 * 100)}% full after three months`} />
          <div className="text-sm text-muted">After 3 months</div>
        </div>
      </div>

      <p className="mt-6 border-t border-line pt-5 text-lg leading-snug">
        At {usd(weekly, { cents: false })} a week, {goal.label.toLowerCase()} ({usd(goal.target, { cents: false })}) is{" "}
        <strong className="font-display font-semibold">{untilLabel(weeks)}</strong> away
        {asset ? `, invested in ${asset.name} while you wait.` : "."}
      </p>
      <p className="mt-2 text-xs text-muted">Live prices from True Markets. Estimates ignore price changes; investments can lose value.</p>
    </div>
  );
}
