"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    if (!res) {
      setBusy(false);
      return setError("Can't reach Jarful. Check your connection and try again.");
    }
    if (!res.ok) {
      setBusy(false);
      return setError((await res.json().catch(() => ({}))).error ?? "Something went wrong. Try again.");
    }
    const next = params.get("next");
    router.replace(next?.startsWith("/app") ? next : mode === "signup" ? "/app/goals/new?welcome=1" : "/app");
    router.refresh();
  }

  const signup = mode === "signup";
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
      {signup && (
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Your name
          </label>
          <input id="name" name="name" required maxLength={60} autoComplete="given-name" className="field" />
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="field" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={signup ? 8 : 1}
          autoComplete={signup ? "new-password" : "current-password"}
          className="field"
        />
        {signup && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-[color-mix(in_srgb,var(--loss)_10%,white)] px-3 py-2 text-sm text-loss">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary w-full py-3">
        {busy && <span className="spinner" aria-hidden />}
        {signup ? (busy ? "Creating your wallet…" : "Create account") : busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted">
        {signup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-cobalt underline-offset-2 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Jarful?{" "}
            <Link href="/signup" className="font-medium text-cobalt underline-offset-2 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
