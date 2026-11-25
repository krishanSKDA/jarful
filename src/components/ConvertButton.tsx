"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { qty, usd } from "@/lib/format";

/** "Convert to USDC" for another dollar stablecoin, with an inline confirmation. */
export function ConvertButton({ assetId, symbol, amount }: { assetId: string; symbol: string; amount: number }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function convert() {
    setStep("busy");
    setMsg(null);
    const r = await fetch("/api/wallet/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setStep("idle");
    if (!r?.ok) return setMsg({ ok: false, text: j.error ?? "Can't reach Jarful. Check your connection." });
    if (j.status === "complete") setMsg({ ok: true, text: `Converted ${qty(j.sold, symbol)} to USDC. It's now cash you can add to jars.` });
    else if (j.status === "failed" || j.status === "canceled") setMsg({ ok: false, text: "The conversion didn't go through. Nothing was spent." });
    else setMsg({ ok: true, text: "Converting now. Your cash updates in a moment." });
    router.refresh();
  }

  return (
    <div className="mt-2">
      {step === "confirm" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Sell {qty(amount, symbol)} for about {usd(amount * 0.998)} USDC? A small fee applies.
          </span>
          <button type="button" className="btn btn-primary px-4 py-1.5 text-sm" onClick={convert}>
            Yes, convert
          </button>
          <button type="button" className="btn btn-quiet px-4 py-1.5 text-sm" onClick={() => setStep("idle")}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" disabled={step === "busy"} className="btn btn-quiet px-4 py-1.5 text-sm" onClick={() => setStep("confirm")}>
          {step === "busy" && <span className="spinner" aria-hidden />}
          {step === "busy" ? "Converting…" : "Convert to USDC"}
        </button>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-gain" : "text-loss"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
