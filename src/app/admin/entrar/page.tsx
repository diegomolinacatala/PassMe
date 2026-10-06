import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { Logo } from "@/components/brand/logo";
import { getAdminCredentials } from "@/lib/admin/auth";
import { hasAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Panel privado", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  const credentials = getAdminCredentials();
  if (!credentials) notFound();
  if (await hasAdminSession(credentials)) redirect("/admin");

  return (
    <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-10">
      <Logo />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
        <p className="eyebrow">Panel privado</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] tracking-tight">
          Cómo va <em className="text-signal">PassMe.</em>
        </h1>
        <p className="mt-4 text-ink-soft">Solo para quien lleva el producto.</p>
        <div className="mt-8">
          <AdminLoginForm />
        </div>
      </div>
    </main>
  );
}
