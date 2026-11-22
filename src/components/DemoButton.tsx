"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Opens a fresh demo account: simulated cash, three part-filled jars, live prices. */
export function DemoButton({ className = "btn btn-quiet", children = "Try the demo" }: { className?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    if (r?.ok) {
      router.push("/app");
      router.refresh();
      return;
    }
    const j = r ? await r.json().catch(() => ({})) : {};
    setError(j.error ?? "Can't reach Jarful. Check your connection.");
    setBusy(false);
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={start} disabled={busy} className={className}>
        {busy && <span className="spinner" aria-hidden />}
        {busy ? "Opening the demo…" : children}
      </button>
      {error && (
        <span role="alert" className="text-sm text-loss">
          {error}
        </span>
      )}
    </span>
  );
}
