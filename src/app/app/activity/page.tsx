import { requireUser } from "@/lib/auth";
import { listTransactions, type TmTransaction } from "@/lib/tm";
import { qty, relDate } from "@/lib/format";

export const metadata = { title: "Activity" };

function describe(t: TmTransaction) {
  if (t.type === "order") return `${t.order?.side === "sell" ? "Sold" : "Bought"} ${t.asset_symbol}`;
  if (t.type === "received_transfer") return `Received ${t.asset_symbol}`;
  if (t.type === "transfer") return `Sent ${t.asset_symbol}`;
  return `${t.asset_symbol} transfer`;
}

const STATUS: Record<string, { label: string; color: string }> = {
  completed: { label: "Done", color: "var(--gain)" },
  pending: { label: "Settling", color: "var(--muted)" },
  active: { label: "Open", color: "var(--muted)" },
  failed: { label: "Failed", color: "var(--loss)" },
  canceled: { label: "Canceled", color: "var(--muted)" },
};

export default async function ActivityPage() {
  const user = await requireUser();
  const txs = user.tm_user_id ? await listTransactions(user.tm_user_id, 50).then((r) => r.data).catch(() => null) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold">Activity</h1>
        <p className="mt-2 text-muted">Every deposit and trade in your wallet, straight from the chain.</p>
      </div>
      <section className="panel p-2 sm:p-4">
        {txs === null ? (
          <p className="p-4 text-muted">Activity isn&apos;t available right now. Refresh in a minute.</p>
        ) : txs.length === 0 ? (
          <p className="p-4 text-muted">No activity yet. Your first deposit will appear here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {txs.map((t) => {
              const s = STATUS[t.status] ?? { label: t.status, color: "var(--muted)" };
              const amount = t.type === "order" ? Number(t.order?.executed_qty ?? t.qty ?? 0) : Number(t.qty ?? 0);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-3">
                  <span
                    aria-hidden
                    className={`flex size-9 items-center justify-center rounded-full text-lg font-bold ${t.asset_flow === "in" ? "bg-cobalt-soft text-cobalt" : "bg-porcelain text-ink"}`}
                  >
                    {t.asset_flow === "in" ? "↓" : "↑"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{describe(t)}</div>
                    <div className="text-sm text-muted">
                      {relDate(t.created_at)}
                      {t.failure_reason ? `. ${t.failure_reason}` : ""}
                    </div>
                  </div>
                  <div className="num text-right">
                    <div className="font-semibold">
                      {t.asset_flow === "in" ? "+" : "−"}
                      {qty(amount, t.asset_symbol)}
                    </div>
                    <div className="text-sm" style={{ color: s.color }}>
                      {s.label}
                      {t.explorer_url && (
                        <>
                          {" "}
                          <a href={t.explorer_url} target="_blank" rel="noreferrer" className="text-cobalt underline-offset-2 hover:underline">
                            View on explorer
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
