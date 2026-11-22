import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2" aria-label="Jarful home">
      <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden>
        <rect x="5" y="1" width="12" height="4" rx="1.2" fill="var(--ink)" />
        <path d="M6.5 5v2c0 1.6-4.5 2-4.5 5.5V23a3.5 3.5 0 0 0 3.5 3.5h11A3.5 3.5 0 0 0 20 23V12.5C20 9 15.5 8.6 15.5 7V5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.8" />
        <path d="M2.9 17.5c2.7-1.3 5.4 1.3 8.1 0s5.4 1.3 8.1 0V23a2.6 2.6 0 0 1-2.6 2.6H5.5A2.6 2.6 0 0 1 2.9 23z" fill="var(--cobalt)" />
      </svg>
      <span className="font-display text-xl font-bold tracking-tight">jarful</span>
    </Link>
  );
}
