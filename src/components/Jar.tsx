import { useId } from "react";

/**
 * A glass jar whose liquid level shows progress toward a goal.
 * The marigold line marks "full" (the target). Pending buys show as a lighter band above the settled level.
 */
export function Jar({
  progress,
  pending = 0,
  size = 120,
  emoji,
  label,
  animate = true,
}: {
  progress: number; // settled value / target
  pending?: number; // pending value / target
  size?: number;
  emoji?: string;
  label?: string;
  animate?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const FULL_Y = 48;
  const BOTTOM_Y = 156;
  const H = BOTTOM_Y - FULL_Y;
  const p = Math.max(0, Math.min(1, progress));
  const pp = Math.max(0, Math.min(1 - p, pending));
  const liquidTop = BOTTOM_Y - H * p;
  const pendingTop = BOTTOM_Y - H * (p + pp);
  const visibleTop = p > 0 ? Math.min(liquidTop, BOTTOM_Y - 3) : BOTTOM_Y;
  const body =
    "M36 22 L36 30 C36 38 14 40 14 58 L14 140 C14 150 22 156 32 156 L88 156 C98 156 106 150 106 140 L106 58 C106 40 84 38 84 30 L84 22 Z";
  const wave = "M0 0 Q15 -4 30 0 T60 0 T90 0 T120 0 T150 0 T180 0 T210 0 T240 0 V200 H0 Z";

  return (
    <svg
      viewBox="0 0 120 162"
      width={size}
      height={(size * 162) / 120}
      role="img"
      aria-label={label ?? `${Math.round(progress * 100)}% full`}
      className="block overflow-visible"
    >
      <defs>
        <clipPath id={`clip-${id}`}>
          <path d={body} />
        </clipPath>
      </defs>

      {/* glass */}
      <path d={body} fill="var(--surface)" />

      <g clipPath={`url(#clip-${id})`}>
        {pp > 0 && (
          <rect x="0" y={pendingTop} width="120" height={BOTTOM_Y - pendingTop + 4} fill="var(--cobalt-soft)" />
        )}
        {p > 0 && (
          <g className={animate ? "jar-liquid" : undefined} style={{ ["--rise-from" as string]: `${BOTTOM_Y - visibleTop}px` }}>
            <g transform={`translate(0 ${visibleTop})`}>
              <path d={wave} fill="var(--cobalt)" className={animate ? "jar-wave" : undefined} />
            </g>
          </g>
        )}
        {/* target line */}
        <line x1="10" x2="110" y1={FULL_Y} y2={FULL_Y} stroke="var(--marigold)" strokeWidth="2.5" strokeDasharray="5 4" />
      </g>

      {/* glass outline + highlight */}
      <path d={body} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 66 L24 132" stroke="#fff" strokeOpacity="0.7" strokeWidth="4" strokeLinecap="round" />
      {/* lid */}
      <rect x="30" y="6" width="60" height="16" rx="4" fill="var(--ink)" />
      <rect x="30" y="12" width="60" height="2" fill="var(--porcelain)" opacity="0.25" />

      {emoji && (
        <text x="60" y="108" textAnchor="middle" fontSize="30" style={{ filter: p > 0.45 ? "drop-shadow(0 1px 0 rgba(255,255,255,.5))" : undefined }}>
          {emoji}
        </text>
      )}
    </svg>
  );
}
