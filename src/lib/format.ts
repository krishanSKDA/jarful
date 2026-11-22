/** Formatting helpers shared by server and client components. */

export function usd(v: number | null | undefined, opts: { cents?: boolean; sign?: boolean } = {}) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const cents = opts.cents ?? Math.abs(v) < 10_000;
  const s = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(Math.abs(v));
  if (opts.sign) return `${v >= 0 ? "+" : "−"}${s}`;
  return v < 0 ? `−${s}` : s;
}

export function price(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const digits = v >= 1 ? 2 : v >= 0.01 ? 4 : 8;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: digits }).format(v);
}

export function qty(v: number | null | undefined, symbol?: string) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const digits = v >= 100 ? 2 : v >= 1 ? 4 : 6;
  const s = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(v);
  return symbol ? `${s} ${symbol}` : s;
}

export function pct(v: number | null | undefined, sign = true) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = `${Math.abs(v * 100).toFixed(Math.abs(v) < 0.1 ? 2 : 1)}%`;
  return sign ? `${v >= 0 ? "+" : "−"}${s}` : s;
}

export function shortAddress(a: string) {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export function relDate(d: string | Date) {
  const date = new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** Whole weeks from now until `date` (at least 1). */
export function weeksUntil(date: Date | string) {
  return Math.max(1, Math.ceil((new Date(date).getTime() - Date.now()) / (7 * 864e5)));
}

/** Weeks needed to reach `target` adding `perWeek`, ignoring growth. */
export function weeksTo(target: number, have: number, perWeek: number) {
  if (perWeek <= 0) return Infinity;
  return Math.max(0, Math.ceil((target - have) / perWeek));
}

export function untilLabel(weeks: number) {
  if (!Number.isFinite(weeks)) return "—";
  if (weeks === 0) return "now";
  if (weeks < 9) return `${weeks} week${weeks === 1 ? "" : "s"}`;
  const months = Math.round(weeks / 4.345);
  if (months < 24) return `${months} months`;
  return `${(weeks / 52).toFixed(1)} years`;
}
