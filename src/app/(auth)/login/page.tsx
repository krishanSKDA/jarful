import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="font-display text-4xl font-bold">Welcome back</h1>
      <p className="mb-8 mt-2 text-muted">Sign in to check on your jars.</p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </>
  );
}
