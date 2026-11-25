import Link from "next/link";
import { NewGoalForm } from "@/components/NewGoalForm";
import { requireUser } from "@/lib/auth";
import { catalog, type CatalogAsset } from "@/lib/catalog";
import { config } from "@/lib/env";

export const metadata = { title: "New jar" };

export default async function NewGoalPage({ searchParams }: PageProps<"/app/goals/new">) {
  const { welcome } = await searchParams;
  const [user, featured] = await Promise.all([requireUser(), catalog("featured").catch((): CatalogAsset[] => [])]);
  return (
    <div className="space-y-8">
      <div>
        <Link href="/app" className="text-sm font-medium text-muted hover:text-ink">
          Back to your jars
        </Link>
        <h1 className="font-display mt-2 text-4xl font-bold sm:text-5xl">{welcome ? "Your wallet is ready. Make your first jar." : "Make a new jar"}</h1>
      </div>
      {featured.length === 0 ? (
        <p className="panel p-6 text-muted">The asset list isn&apos;t loading right now. Refresh the page in a minute.</p>
      ) : (
        <NewGoalForm featured={featured} minOrder={config.minOrderUsd} maxOrder={config.maxOrderUsd} demo={user.is_demo} />
      )}
    </div>
  );
}
