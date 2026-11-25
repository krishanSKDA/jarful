import Link from "next/link";
import { Jar } from "@/components/Jar";
import { CopyButton } from "@/components/AppNav";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { cashBalance, listGoals, syncPending } from "@/lib/goals";
import { pct, relDate, shortAddress, usd } from "@/lib/format";

export const metadata = { title: "Your jars" };

function greeting() {
  const h = new Date().getUTCHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const user = await requireUser();
  await syncPending(user).catch(() => null);
  const [goals, cash, recent] = await Promise.all([
    listGoals(user.id),
    cashBalance(user).catch(() => null),
    query<{ id: string; goal_id: string; side: string; source: string; usd_amount: number | null; status: string; created_at: Date; name: string; emoji: string }>(
      `SELECT c.id, c.goal_id, c.side, c.source, c.usd_amount, c.status, c.created_at, g.name, g.emoji
         FROM contributions c JOIN goals g ON g.id = c.goal_id
        WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT 6`,
      [user.id],
    ),
  ]);
  const total = goals.reduce((s, g) => s + g.value, 0);
  const invested = goals.reduce((s, g) => s + g.invested, 0);
  const gain = total - invested;

  return (
    <div className="space-y-12">
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl font-bold sm:text-5xl">
            {greeting()}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-2 text-lg text-muted">
            {goals.length === 0 ? (
              "Make a jar for something you want, then start filling it."
            ) : (
              <>
                <span className="num font-semibold text-ink">{usd(total)}</span> across {goals.length} jar{goals.length === 1 ? "" : "s"}
                {invested > 0 && (
                  <>
                    , <span style={{ color: gain >= 0 ? "var(--gain)" : "var(--loss)" }}>{usd(gain, { sign: true })}</span> since you started
                  </>
                )}
                .
              </>
            )}
          </p>
        </div>
        <Link href="/app/goals/new" className="btn btn-primary">
          New jar
        </Link>
      </section>

      {/* The shelf */}
      <section aria-label="Your jars">
        <div className="relative">
          <ul className="flex snap-x gap-x-6 gap-y-10 overflow-x-auto px-1 pb-0 sm:flex-wrap sm:overflow-visible">
            {goals.map((g) => (
              <li key={g.id} className="w-[150px] shrink-0 snap-start">
                <Link href={`/app/goals/${g.id}`} className="group block rounded-2xl p-1">
                  <div className="flex h-[205px] items-end justify-center">
                    <Jar
                      progress={g.price ? (g.qty * g.price) / g.target_usd : 0}
                      pending={g.price ? (g.pendingQty * g.price) / g.target_usd : 0}
                      emoji={g.emoji}
                      size={136}
                      label={`${g.name}: ${Math.round(g.progress * 100)}% full`}
                    />
                  </div>
                  <div className="h-[3px] rounded-full bg-ink" aria-hidden />
                  <div className="mt-3 px-1">
                    <div className="truncate font-semibold group-hover:text-cobalt">{g.name}</div>
                    <div className="num text-sm text-muted">
                      {usd(g.value)} of {usd(g.target_usd, { cents: false })}
                    </div>
                    <div className="num text-sm font-medium">{g.progress >= 1 ? "Full" : `${Math.floor(g.progress * 100)}% full`}</div>
                  </div>
                </Link>
              </li>
            ))}
            <li className="w-[150px] shrink-0 snap-start">
              <Link href="/app/goals/new" className="group block rounded-2xl p-1">
                <div className="flex h-[205px] items-end justify-center">
                  <svg viewBox="0 0 120 162" width={136} height={183} aria-hidden>
                    <path
                      d="M36 22 L36 30 C36 38 14 40 14 58 L14 140 C14 150 22 156 32 156 L88 156 C98 156 106 150 106 140 L106 58 C106 40 84 38 84 30 L84 22 Z"
                      fill="none"
                      stroke="var(--muted)"
                      strokeWidth="2"
                      strokeDasharray="6 6"
                      className="group-hover:stroke-[var(--cobalt)]"
                    />
                    <path d="M60 80 v36 M42 98 h36" stroke="var(--muted)" strokeWidth="3" strokeLinecap="round" className="group-hover:stroke-[var(--cobalt)]" />
                  </svg>
                </div>
                <div className="h-[3px] rounded-full bg-ink" aria-hidden />
                <div className="mt-3 px-1 font-semibold text-muted group-hover:text-cobalt">{goals.length ? "Add another jar" : "Make your first jar"}</div>
              </Link>
            </li>
          </ul>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {cash !== null && cash < 1 && user.solana_address ? (
          <section className="panel p-6">
            <h2 className="font-display text-2xl font-semibold">Add cash to start filling</h2>
            <p className="mt-2 text-muted">
              Send <strong className="text-ink">USDC on the Solana network</strong> to your Jarful wallet. It usually arrives within a minute. Three dollars is enough
              for a first buy.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-porcelain px-4 py-3">
              <code className="num break-all text-sm" title={user.solana_address}>
                {user.solana_address}
              </code>
              <CopyButton text={user.solana_address} label="Copy address" />
            </div>
            <Link href="/app/wallet" className="mt-4 inline-block text-sm font-medium text-cobalt hover:underline">
              Show QR code and balances
            </Link>
          </section>
        ) : (
          <section className="panel p-6">
            <h2 className="font-display text-2xl font-semibold">Cash ready to invest</h2>
            <p className="font-display num mt-2 text-4xl font-bold">{cash === null ? "N/A" : usd(cash)}</p>
            <p className="mt-2 text-muted">
              {user.is_demo ? "Pretend cash for the demo" : `Dollar stablecoins (USDC, PYUSD) in your wallet${user.solana_address ? ` (${shortAddress(user.solana_address)})` : ""}`}. Open a jar to add some of it.
            </p>
          </section>
        )}

        <section className="panel p-6">
          <h2 className="font-display text-2xl font-semibold">Latest moves</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-muted">Buys and cash-outs from your jars will show up here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <span aria-hidden className="text-xl">
                    {r.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/goals/${r.goal_id}`} className="block truncate text-sm font-medium hover:text-cobalt">
                      {r.side === "buy" ? (r.source === "auto" ? "Auto-invest into" : "Added to") : "Cashed out"} {r.name}
                    </Link>
                    <div className="text-xs text-muted">
                      {relDate(r.created_at)}
                      {r.status !== "complete" && ` (${r.status === "failed" ? "didn't go through" : "settling"})`}
                    </div>
                  </div>
                  <span className="num text-sm font-semibold" style={{ color: r.status === "failed" ? "var(--muted)" : undefined }}>
                    {r.side === "buy" ? "+" : "−"}
                    {usd(Number(r.usd_amount ?? 0))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {goals.length > 0 && invested > 0 && (
        <p className="text-sm text-muted">
          Jar values use live prices and include buys that are still settling. Overall change: {pct(invested ? gain / invested : 0)}.
        </p>
      )}
    </div>
  );
}
