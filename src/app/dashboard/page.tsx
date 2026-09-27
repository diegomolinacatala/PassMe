import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { CardEditor } from "@/components/editor/card-editor";
import { DEMO_CARD } from "@/lib/card/demo";
import { getAppleWalletConfig, getConfigStatus, getGoogleWalletConfig } from "@/lib/config.server";
import { EMPTY_STATS, getOrCreateOwnerCard, getOwnStats } from "@/lib/data/cards";
import { getSiteUrl } from "@/lib/env";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mi tarjeta", robots: { index: false } };

function DashboardHeader({ slug }: { slug: string }) {
  return (
    <header className="border-b hairline">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 sm:px-8">
        <Logo href="/dashboard" />
        <Link
          href={`/u/${slug}`}
          target="_blank"
          className="rounded-full px-3 py-1.5 font-mono text-[12px] tracking-wide text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink"
        >
          /u/{slug} ↗
        </Link>
      </div>
    </header>
  );
}

export default async function DashboardPage() {
  const supabase = await createServerSupabase();

  // Demo mode: no Supabase yet → play with the sample card, nothing persists.
  if (!supabase) {
    return (
      <>
        <DashboardHeader slug={DEMO_CARD.slug} />
        <CardEditor
          initialCard={DEMO_CARD}
          stats={EMPTY_STATS}
          wallet={{ apple: getAppleWalletConfig() !== null, google: getGoogleWalletConfig() !== null, handoff: false }}
          siteUrl={getSiteUrl()}
          email={null}
          demo
        />
      </>
    );
  }

  const user = await getSessionUser(supabase);
  if (!user) redirect("/login?next=/dashboard");

  const [card, stats] = await Promise.all([getOrCreateOwnerCard(supabase, user), getOwnStats(supabase)]);
  const status = getConfigStatus();

  return (
    <>
      <DashboardHeader slug={card.slug} />
      <CardEditor
        initialCard={card}
        stats={stats}
        wallet={{
          apple: status.appleWallet && status.supabaseSecretKey,
          google: status.googleWallet && status.supabaseSecretKey,
          handoff: status.signingSecret,
        }}
        siteUrl={getSiteUrl()}
        email={user.email}
        demo={false}
      />
    </>
  );
}
