import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Jar } from "@/components/Jar";
import { currentUser } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Demo visitors can still reach sign-up / sign-in to create a real account.
  const user = await currentUser();
  if (user && !user.is_demo) redirect("/app");
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
      </div>
      <aside className="hidden items-center justify-center border-l border-line bg-surface lg:flex" aria-hidden>
        <div className="flex items-end gap-6">
          <Jar progress={0.32} emoji="🛟" size={110} />
          <Jar progress={0.71} emoji="🗾" size={150} />
          <Jar progress={0.12} emoji="💻" size={120} />
        </div>
      </aside>
    </div>
  );
}
