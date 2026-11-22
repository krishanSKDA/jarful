import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="font-display text-4xl font-bold">Start your first jar</h1>
      <p className="mb-8 mt-2 text-muted">Your account comes with its own wallet. It takes a few seconds to set up.</p>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </>
  );
}
