import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignedInBeacon } from "@/components/auth/session-sync";
import { Logo } from "@/components/brand/logo";
import { CardEditor } from "@/components/editor/card-editor";
import { WelcomePanel } from "@/components/editor/welcome-panel";
import type { WalletAvailability } from "@/components/editor/wallet-panel";
import { DEMO_CARD, DEMO_CONTACT_REQUESTS } from "@/lib/card/demo";
import { parseFromSlug } from "@/lib/card/quick";
import type { OwnerCard } from "@/lib/card/types";
import { getAppleWalletConfig, getConfigStatus, getGoogleWalletConfig } from "@/lib/config.server";
import { EMPTY_STATS, findOwnerCard, getOwnStats, getPublicCard } from "@/lib/data/cards";
import { listOwnContactRequests } from "@/lib/data/contact-requests";
import { getSiteUrl, profileUrl } from "@/lib/env";
import { detectPlatform } from "@/lib/platform";
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

/**
 * The just-created card's welcome (?nueva=1), naming whose card led here (?de=…),
 * or a note for an account that went through /crear but already had a card (?existente=1).
 */
async function welcomeFor(
  query: Record<string, string | string[] | undefined>,
  card: OwnerCard,
  wallet: WalletAvailability,
  demo: boolean,
) {
  if (query.existente === "1") {
    return (
      <p role="status" className="rounded-2xl border hairline bg-card px-4 py-3 text-sm text-ink-soft">
        Ya tenías una tarjeta con esta cuenta: aquí la tienes. Cambia lo que quieras y guarda.
      </p>
    );
  }
  if (query.nueva !== "1") return null;
  const from = parseFromSlug(query.de);
  const referrer = from && from !== card.slug ? await getPublicCard(from) : null;
  const platform = detectPlatform((await headers()).get("user-agent"));
  return (
    <WelcomePanel
      slug={card.slug}
      fullName={card.fullName}
      qrUrl={profileUrl(card.slug, "qr")}
      shareUrl={profileUrl(card.slug, "share")}
      referrerName={referrer?.fullName ?? null}
      wallet={wallet}
      platform={platform}
      demo={demo}
    />
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const query = await searchParams;
  const supabase = await createServerSupabase();

  // Demo mode: no Supabase yet → play with the sample card, nothing persists.
  if (!supabase) {
    const wallet = { apple: getAppleWalletConfig() !== null, google: getGoogleWalletConfig() !== null, handoff: false };
    return (
      <>
        <SignedInBeacon />
        <DashboardHeader slug={DEMO_CARD.slug} />
        <CardEditor
          initialCard={DEMO_CARD}
          stats={EMPTY_STATS}
          contacts={{ available: true, requests: DEMO_CONTACT_REQUESTS }}
          wallet={wallet}
          siteUrl={getSiteUrl()}
          email={null}
          demo
          welcome={await welcomeFor(query, DEMO_CARD, wallet, true)}
        />
      </>
    );
  }

  const user = await getSessionUser(supabase);
  if (!user) redirect("/login?next=/dashboard");

  // No card yet (or one that was never filled in): the quick form makes it in a minute.
  const card = await findOwnerCard(supabase, user.id);
  if (!card?.fullName) redirect("/crear");

  const [stats, contacts] = await Promise.all([getOwnStats(supabase), listOwnContactRequests(supabase)]);
  const status = getConfigStatus();
  const wallet = {
    apple: status.appleWallet && status.supabaseSecretKey,
    google: status.googleWallet && status.supabaseSecretKey,
    handoff: status.signingSecret,
  };

  return (
    <>
      <SignedInBeacon />
      <DashboardHeader slug={card.slug} />
      <CardEditor
        initialCard={card}
        stats={stats}
        contacts={contacts}
        wallet={wallet}
        siteUrl={getSiteUrl()}
        email={user.email}
        demo={false}
        welcome={await welcomeFor(query, card, wallet, false)}
      />
    </>
  );
}
