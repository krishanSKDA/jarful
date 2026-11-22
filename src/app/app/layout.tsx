import Link from "next/link";
import { AppNav, SignOutButton } from "@/components/AppNav";
import { Logo } from "@/components/Logo";
import { ensureProvisioned, requireUser } from "@/lib/auth";
import { cashBalance } from "@/lib/goals";
import { usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user = await requireUser();
  user = await ensureProvisioned(user).catch(() => user);
  const cash = await cashBalance(user).catch(() => null);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-porcelain/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Logo href="/app" />
          <div className="ml-2 hidden sm:block">
            <AppNav />
          </div>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/app/wallet" className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-ink">
              <span className="text-muted">Cash </span>
              <span className="num font-semibold">{cash === null ? "N/A" : usd(cash)}</span>
            </Link>
            <SignOutButton />
          </div>
        </div>
        <div className="border-t border-line px-4 py-2 sm:hidden">
          <AppNav />
        </div>
        {user.is_demo && (
          <div className="border-t border-[color-mix(in_srgb,var(--marigold)_55%,transparent)] bg-[color-mix(in_srgb,var(--marigold)_22%,white)]">
            <p className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm sm:px-6">
              <span>
                <strong>Demo account.</strong> Prices are live; the cash and trades are pretend. No real money moves.
              </span>
              <Link href="/signup" className="font-semibold underline underline-offset-2 hover:text-cobalt">
                Create a real account
              </Link>
            </p>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
