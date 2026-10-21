import type { Metadata } from "next";
import type { ReactNode } from "react";
import { adminLogoutAction } from "@/app/crm/actions";
import { CrmNav } from "@/components/admin/crm-nav";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { requireAdminSession } from "@/lib/admin/session";

// No referrer: links out of the CRM (a user's LinkedIn, their card) never carry its addresses.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The private CRM: its own username and password (env vars), not a PassMe
 * account. Every page and route also checks the session itself: a layout
 * doesn't run for every request.
 */
export default async function CrmLayout({ children }: { children: ReactNode }) {
  await requireAdminSession();
  return (
    <div className="min-h-dvh">
      <header className="border-b hairline">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo href="/crm" />
            <span className="eyebrow">CRM</span>
          </div>
          <form action={adminLogoutAction} className="sm:order-last">
            <Button type="submit" variant="ghost" size="sm">
              Salir
            </Button>
          </form>
          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
            <CrmNav />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-4 pt-8 pb-16 sm:px-8 sm:pt-12">{children}</main>
    </div>
  );
}
