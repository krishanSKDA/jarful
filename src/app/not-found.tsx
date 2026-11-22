import Link from "next/link";
import { Jar } from "@/components/Jar";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Jar progress={0} emoji="🫙" size={110} animate={false} label="An empty jar" />
      <div>
        <h1 className="font-display text-4xl font-bold">Nothing in this jar</h1>
        <p className="mt-2 text-muted">The page you followed doesn&apos;t exist or isn&apos;t yours.</p>
      </div>
      <Link href="/app" className="btn btn-primary">
        Go to your jars
      </Link>
    </main>
  );
}
