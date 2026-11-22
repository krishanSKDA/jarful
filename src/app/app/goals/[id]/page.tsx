import Link from "next/link";
import { notFound } from "next/navigation";
import { Jar } from "@/components/Jar";
import { ContributePanel } from "@/components/ContributePanel";
import { AutoInvest, JarActions } from "@/components/GoalSettings";
import { PriceChart } from "@/components/PriceChart";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/env";
import { cashBalance, getGoal, goalContributions, syncPending } from "@/lib/goals";
import { pct, qty, relDate, usd, weeksUntil } from "@/lib/format";

export const metadata = { title: "Jar" };

export default async function GoalPage({ params, searchParams }: PageProps<"/app/goals/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { created } = await searchParams;
  await syncPending(user).catch(() => null);
  const goal = await getGoal(user.id, id);
  if (!goal) notFound();
  const [history, cash] = await Promise.all([goalContributions(user.id, goal.id), cashBalance(user).catch(() => null)]);

  const gain = goal.value - goal.invested;
  const remaining = Math.max(0, goal.target_usd - goal.value);
  const deadline = goal.deadline ? new Date(goal.deadline) : null;
  const weeksLeft = deadline ? weeksUntil(deadline) : null;
  const onTrack = weeksLeft && remaining > 0 ? Math.ceil(remaining / weeksLeft) : null;
  const settled = goal.price ? (goal.qty * goal.price) / goal.target_usd : 0;
  const pending = goal.price ? (goal.pendingQty * goal.price) / goal.target_usd : 0;

  return (
    <div className="space-y-8">
      <Link href="/app" className="text-sm font-medium text-muted hover:text-ink">
        All jars
      </Link>

      {created && (
        <p role="status" className="rounded-xl bg-cobalt-soft px-4 py-3">
          Your jar is ready. Add some cash below to start filling it.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-8">
          <section className="panel grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-8">
            <div className="mx-auto">
              <Jar progress={settled} pending={pending} emoji={goal.emoji} size={190} label={`${goal.name}: ${Math.round(goal.progress * 100)}% full`} />
              <div className="h-[3px] rounded-full bg-ink" aria-hidden />
            </div>
            <div>
              <h1 className="font-display text-4xl font-bold sm:text-5xl">{goal.name}</h1>
              <p className="mt-1 text-muted">
                Growing in {goal.asset_name} ({goal.asset_symbol})
              </p>
              <p className="font-display num mt-5 text-5xl font-bold">{usd(goal.value)}</p>
              <p className="num text-muted">
                of {usd(goal.target_usd, { cents: false })}.{" "}
                {goal.progress >= 1 ? <strong className="text-ink">This jar is full.</strong> : `${usd(remaining)} to go.`}
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted">You put in</dt>
                  <dd className="num font-semibold">{usd(goal.invested)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Growth</dt>
                  <dd className="num font-semibold" style={{ color: goal.invested ? (gain >= 0 ? "var(--gain)" : "var(--loss)") : undefined }}>
                    {goal.invested ? `${usd(gain, { sign: true })} (${pct(gain / goal.invested)})` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Holding</dt>
                  <dd className="num font-semibold">{qty(goal.qty + goal.pendingQty, goal.asset_symbol)}</dd>
                </div>
                {deadline && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-muted">Target date</dt>
                    <dd>
                      {deadline.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      {onTrack ? `. Add about ${usd(onTrack, { cents: false })} a week to make it.` : ""}
                    </dd>
                  </div>
                )}
              </dl>
              {goal.pendingQty > 0 && <p className="mt-4 text-sm text-muted">The lighter band is a buy that&apos;s still settling on-chain.</p>}
              {goal.progress < 1 && (
                <a href="#add-heading" className="btn btn-primary mt-5 w-full lg:hidden">
                  Add to this jar
                </a>
              )}
            </div>
          </section>

          <section className="panel p-6">
            <PriceChart economicId={goal.economic_id} symbol={goal.asset_symbol} />
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-2xl font-semibold">History</h2>
            {history.length === 0 ? (
              <p className="mt-2 text-muted">No buys yet. Your first one will show up here.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {history.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {c.side === "sell" ? "Cashed out" : c.source === "auto" ? "Auto-invest" : "Added"}
                        {c.status === "failed" && <span className="font-normal text-loss"> didn&apos;t go through</span>}
                        {(c.status === "pending" || c.status === "placing") && <span className="font-normal text-muted"> (settling)</span>}
                      </div>
                      <div className="text-sm text-muted">
                        {relDate(c.created_at)}
                        {c.error ? `. ${c.error}` : ""}
                      </div>
                    </div>
                    <div className="num text-right">
                      <div className="font-semibold">
                        {c.side === "buy" ? "+" : "−"}
                        {usd(c.usd_amount ?? 0)}
                      </div>
                      {(c.qty ?? c.est_qty) && c.status !== "failed" ? (
                        <div className="text-sm text-muted">{qty(c.qty ?? c.est_qty, goal.asset_symbol)}</div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {goal.progress < 1 && (
            <ContributePanel
              goalId={goal.id}
              assetId={goal.asset_id}
              symbol={goal.asset_symbol}
              cash={cash}
              suggested={onTrack && onTrack >= config.minOrderUsd ? onTrack : null}
              minOrder={config.minOrderUsd}
              maxOrder={config.maxOrderUsd}
            />
          )}
          <AutoInvest
            goalId={goal.id}
            amount={goal.auto_amount}
            interval={goal.auto_interval}
            nextRun={goal.next_run_at ? new Date(goal.next_run_at).toISOString() : null}
            suggested={onTrack}
          />
          <JarActions goalId={goal.id} value={goal.value} symbol={goal.asset_symbol} hasHoldings={goal.qty + goal.pendingQty > 0 && goal.value >= 0.5} />
        </div>
      </div>
    </div>
  );
}
