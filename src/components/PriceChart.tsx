"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pct, price } from "@/lib/format";

type Pt = { t: string; p: number };
const RANGES = [
  { key: "1d", label: "Day" },
  { key: "1w", label: "Week" },
  { key: "1m", label: "Month" },
] as const;

export function PriceChart({ economicId, symbol }: { economicId: string; symbol: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("1w");
  const [data, setData] = useState<Record<string, Pt[] | "error">>({});
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const points = data[range];

  useEffect(() => {
    if (data[range]) return;
    let live = true;
    fetch(`/api/prices/${economicId}?range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => live && setData((d) => ({ ...d, [range]: j.points })))
      .catch(() => live && setData((d) => ({ ...d, [range]: "error" })));
    return () => {
      live = false;
    };
  }, [range, economicId, data]);

  const W = 640;
  const H = 200;
  const geo = useMemo(() => {
    if (!Array.isArray(points) || points.length < 2) return null;
    const vals = points.map((p) => p.p);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - 8 - ((p.p - min) / span) * (H - 24)] as const);
    const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    return { xy, line, area: `${line} L${W} ${H} L0 ${H} Z`, up: vals.at(-1)! >= vals[0] };
  }, [points]);

  const shown = Array.isArray(points) && points.length ? points[hover ?? points.length - 1] : null;
  const change = Array.isArray(points) && points.length > 1 ? (points.at(-1)!.p - points[0].p) / points[0].p : null;
  const color = geo?.up === false ? "var(--loss)" : "var(--gain)";

  function onMove(e: React.PointerEvent) {
    if (!geo || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (geo.xy.length - 1));
    setHover(Math.max(0, Math.min(geo.xy.length - 1, i)));
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{symbol} price</div>
          <div className="font-display num text-2xl font-semibold">{shown ? price(shown.p) : "—"}</div>
          <div className="num text-sm" style={{ color: change === null ? undefined : change >= 0 ? "var(--gain)" : "var(--loss)" }}>
            {hover !== null && shown
              ? new Date(shown.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
              : change !== null
                ? `${pct(change)} this ${RANGES.find((r) => r.key === range)!.label.toLowerCase()}`
                : " "}
          </div>
        </div>
        <div className="flex rounded-full border border-line p-1" role="tablist" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${range === r.key ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 h-[200px]">
        {points === "error" ? (
          <p className="pt-16 text-center text-sm text-muted">Price history isn&apos;t available for this asset right now.</p>
        ) : !geo ? (
          <div className="h-full animate-pulse rounded-xl bg-porcelain" />
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-full w-full touch-none"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={`${symbol} price chart`}
          >
            <defs>
              <linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.16" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={geo.area} fill="url(#pc-fill)" />
            <path d={geo.line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {hover !== null && (
              <>
                <line x1={geo.xy[hover][0]} x2={geo.xy[hover][0]} y1="0" y2={H} stroke="var(--ink)" strokeOpacity="0.25" vectorEffect="non-scaling-stroke" />
                <circle cx={geo.xy[hover][0]} cy={geo.xy[hover][1]} r="4" fill={color} vectorEffect="non-scaling-stroke" />
              </>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
