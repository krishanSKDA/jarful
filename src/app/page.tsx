import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/Logo";
import { LandingCalculator } from "@/components/LandingCalculator";
import { Sparkline } from "@/components/Sparkline";
import { currentUser } from "@/lib/auth";
import { catalog, type CatalogAsset } from "@/lib/catalog";
import { pct, price } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [user, assets] = await Promise.all([currentUser().catch(() => null), catalog("featured").catch((): CatalogAsset[] => [])]);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/app" className="btn btn-primary">
              Open your jars
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-quiet hidden sm:inline-flex">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Start a jar
              </Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:pt-14">
          <div className="max-w-xl">
            <h1 className="font-display text-5xl font-bold leading-[1.02] sm:text-6xl lg:text-7xl">Give every goal its own jar.</h1>
            <p className="mt-6 text-lg text-muted sm:text-xl">
              Name what you&apos;re saving for, choose what it grows in, from the S&amp;P 500 to gold to Apple stock, and fill it a few dollars at a time.
              The jar shows exactly how close you are.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={user ? "/app/goals/new" : "/signup"} className="btn btn-primary px-6 py-3 text-lg">
                Start a jar
              </Link>
              <a href="#how" className="btn btn-quiet px-6 py-3 text-lg">
                How it works
              </a>
            </div>
          </div>
          <LandingCalculator assets={assets} />
        </section>

        <section id="how" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Three steps from wish to owned</h2>
            <ol className="mt-10 grid gap-10 md:grid-cols-3">
              {[
                ["Make a jar", "Name the goal, set the price tag and pick what it grows in. A deadline is optional; Jarful works out the weekly amount."],
                ["Add cash", "Every account gets its own wallet. Send USDC on Solana to it from any exchange or wallet, and it shows up as cash."],
                ["Fill it", "Tap to add $5, $20 or any amount, or let auto-invest top it up every week. Cash out to USDC whenever you're ready."],
              ].map(([title, text], i) => (
                <li key={title} className="flex gap-4">
                  <span className="font-display num flex size-10 shrink-0 items-center justify-center rounded-full bg-cobalt text-lg font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold">{title}</h3>
                    <p className="mt-1 text-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {assets.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">What your jars can hold</h2>
            <p className="mt-2 max-w-2xl text-muted">Tokenized stocks, funds, gold and crypto, priced live. Each one is a real asset held in your own wallet.</p>
            <ul className="mt-8 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-b border-line py-4">
                  {a.icon ? (
                    <Image src={a.icon} alt="" width={32} height={32} className="size-8 rounded-full" unoptimized />
                  ) : (
                    <span className="size-8 rounded-full bg-cobalt-soft" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{a.name}</div>
                    <div className="truncate text-sm text-muted">{a.blurb ?? a.symbol}</div>
                  </div>
                  <Sparkline points={a.spark} width={64} height={24} />
                  <div className="num w-24 text-right">
                    <div className="font-medium">{price(a.price)}</div>
                    <div className="text-sm" style={{ color: (a.change24h ?? 0) >= 0 ? "var(--gain)" : "var(--loss)" }}>
                      {pct(a.change24h)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:px-6 md:flex-row md:justify-between">
          <Logo />
          <p className="max-w-2xl">
            Trading runs on the True Markets Gateway; every trade settles on-chain from your own wallet. Investments can lose value. Tokenized stocks
            aren&apos;t offered in the US or UK.
          </p>
        </div>
      </footer>
    </div>
  );
}
