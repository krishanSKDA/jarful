import Link from "next/link";
import QRCode from "qrcode";
import { CopyButton } from "@/components/AppNav";
import { ConvertButton } from "@/components/ConvertButton";
import { ensureProvisioned, requireUser, type User } from "@/lib/auth";
import { DEMO_CASH } from "@/lib/demo";
import { cashBalance, friendly, listGoals } from "@/lib/goals";
import { latestPrices, solanaAssets, fundingAsset } from "@/lib/catalog";
import { getBalances, type TmBalance } from "@/lib/tm";
import { qty, usd } from "@/lib/format";

export const metadata = { title: "Wallet" };

/** Demo accounts have no on-chain wallet: show the simulated cash and what the jars hold. */
async function DemoWallet({ user }: { user: User }) {
  const [cash, goals] = await Promise.all([cashBalance(user), listGoals(user.id)]);
  const holdings = new Map<string, { symbol: string; name: string; qty: number; value: number }>();
  for (const g of goals) {
    const h = holdings.get(g.asset_id) ?? { symbol: g.asset_symbol, name: g.asset_name, qty: 0, value: 0 };
    h.qty += g.qty + g.pendingQty;
    h.value += g.value;
    holdings.set(g.asset_id, h);
  }
  const rows = [{ symbol: "USDC", name: "US Dollar Coin (cash)", qty: cash, value: cash }, ...[...holdings.values()].filter((h) => h.qty > 0).sort((a, b) => b.value - a.value)];

  return (
    <div className="space-y-8">
      <h1 className="font-display text-4xl font-bold">Wallet</h1>
      <section className="panel p-6">
        <h2 className="font-display text-2xl font-semibold">Add cash</h2>
        <p className="mt-2 max-w-prose text-muted">
          In a real account this is where your deposit address and QR code appear. You send <strong className="text-ink">USDC</strong> on the{" "}
          <strong className="text-ink">Solana</strong> network to it, and it shows up here as cash. The demo started you with {usd(DEMO_CASH, { cents: false })} of pretend
          cash instead.
        </p>
        <Link href="/signup" className="btn btn-primary mt-4">
          Create a real account
        </Link>
      </section>
      <section className="panel p-6">
        <h2 className="font-display text-2xl font-semibold">What&apos;s in it</h2>
        <table className="mt-4 w-full text-left">
          <thead className="text-sm text-muted">
            <tr>
              <th className="pb-2 font-medium">Asset</th>
              <th className="pb-2 text-right font-medium">Amount</th>
              <th className="pb-2 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.symbol}>
                <td className="py-3 font-medium">{r.name}</td>
                <td className="num py-3 text-right">{qty(r.qty, r.symbol)}</td>
                <td className="num py-3 text-right font-semibold">{usd(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default async function WalletPage() {
  let user = await requireUser();
  if (user.is_demo) return <DemoWallet user={user} />;
  if (!user.solana_address || !user.tm_user_id) {
    // Try once more here so a failure is shown, not hidden behind "being set up".
    let problem: string | null = null;
    try {
      user = await ensureProvisioned(user);
    } catch (err) {
      console.error("wallet provisioning failed", { userId: user.id, err });
      problem = friendly(err).message;
    }
    if (!user.solana_address || !user.tm_user_id) {
      return (
        <div className="panel max-w-xl p-6">
          <h1 className="font-display text-3xl font-bold">{problem ? "We couldn't create your wallet yet" : "Your wallet is being set up"}</h1>
          <p className="mt-2 text-muted">{problem ?? "This usually takes a few seconds."}</p>
          <Link href="/app/wallet" prefetch={false} className="btn btn-primary mt-4">
            Try again
          </Link>
        </div>
      );
    }
  }

  const [qr, balances, assets, usdc] = await Promise.all([
    QRCode.toString(user.solana_address, { type: "svg", margin: 1, color: { dark: "#172033", light: "#ffffff" } }),
    getBalances(user.tm_user_id).then((r) => r.data).catch((): TmBalance[] | null => null),
    solanaAssets().catch(() => []),
    fundingAsset().catch(() => undefined),
  ]);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const held = (balances ?? []).filter((b) => Number(b.total) > 0);
  const prices = await latestPrices(held.map((b) => byId.get(b.asset_id)?.economic_asset_id).filter(Boolean) as string[]);
  const rows = held
    .map((b) => {
      const a = byId.get(b.asset_id);
      const isCash = (usdc && b.asset_id === usdc.id) || b.symbol === "USDC";
      // Other dollar stablecoins (e.g. PYUSD) count at $1 but must be converted to USDC before buying.
      const otherStable = !isCash && Boolean(b.stable);
      const p = isCash || otherStable ? 1 : a ? prices.get(a.economic_asset_id) ?? null : null;
      const name = isCash ? "US Dollar Coin (cash)" : otherStable ? `${b.symbol} (dollar stablecoin)` : a?.name ?? b.symbol;
      return { ...b, name, value: p !== null ? Number(b.total) * p : null, isCash, otherStable };
    })
    .sort((x, y) => Number(y.isCash) - Number(x.isCash) || (y.value ?? 0) - (x.value ?? 0));

  return (
    <div className="space-y-8">
      <h1 className="font-display text-4xl font-bold">Wallet</h1>

      <section className="panel grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center">
        <div className="mx-auto w-48 rounded-xl border border-line p-2" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code of your Solana address" role="img" />
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold">Add cash</h2>
          <p className="mt-2 max-w-prose text-muted">
            Send <strong className="text-ink">USDC</strong> on the <strong className="text-ink">Solana</strong> network to this address. USDC sent on any other network
            won&apos;t arrive. Network fees for trades are covered.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-porcelain px-4 py-3">
            <code className="num min-w-0 break-all text-sm">{user.solana_address}</code>
            <CopyButton text={user.solana_address} label="Copy address" />
          </div>
          <p className="mt-3 text-sm text-muted">
            This wallet is yours alone. Trades need approval from both Jarful and True Markets, so neither can move funds without the other.
          </p>
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="font-display text-2xl font-semibold">What&apos;s in it</h2>
        {balances === null ? (
          <p className="mt-2 text-muted">Balances aren&apos;t available right now. Refresh in a minute.</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-muted">Nothing yet. Once your USDC arrives it shows up here as cash.</p>
        ) : (
          <table className="mt-4 w-full text-left">
            <thead className="text-sm text-muted">
              <tr>
                <th className="pb-2 font-medium">Asset</th>
                <th className="pb-2 text-right font-medium">Amount</th>
                <th className="pb-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.asset_id}>
                  <td className="py-3">
                    <div className="font-medium">{r.name}</div>
                    {Number(r.available) < Number(r.total) && <div className="text-xs text-muted">{qty(Number(r.available))} available</div>}
                    {r.otherStable && Number(r.available) >= 1 && (
                      <>
                        <div className="text-sm text-muted">Jars are bought with USDC. Convert this to use it.</div>
                        <ConvertButton assetId={r.asset_id} symbol={r.symbol} amount={Number(r.available)} />
                      </>
                    )}
                  </td>
                  <td className="num py-3 text-right">{qty(Number(r.total), r.symbol)}</td>
                  <td className="num py-3 text-right font-semibold">{usd(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
