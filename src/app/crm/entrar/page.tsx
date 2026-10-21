import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { Logo } from "@/components/brand/logo";
import { adminSessionStatus, CRM_PATH } from "@/lib/admin/session";

export const metadata: Metadata = { title: "CRM", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function CrmLoginPage() {
  const status = await adminSessionStatus();
  if (status === "off") notFound();
  if (status === "in") redirect(CRM_PATH);

  return (
    <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-10">
      <Logo />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
        <p className="eyebrow">CRM privado</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] tracking-tight">
          Todo PassMe, <em className="text-signal">en un sitio.</em>
        </h1>
        <p className="mt-4 text-ink-soft">Solo para quien lleva el producto.</p>
        <div className="mt-8">
          <AdminLoginForm />
        </div>
      </div>
    </main>
  );
}
