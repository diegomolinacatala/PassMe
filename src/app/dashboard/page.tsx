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
import { listOwnMeetings } from "@/lib/data/meetings";
import type { MeetingItem } from "@/components/editor/meetings-panel";
import { meetingPath } from "@/lib/meetings/links";
import type { Meeting } from "@/lib/meetings/model";
import { demoOwnerMeetings, isDemoMeetingId, toMeetingView } from "@/lib/meetings/view";
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

/** What a failed pass download (/api/pass/…, followed as a link) comes back to say. */
const PASS_NOTICES: Record<string, string> = {
  error: "No hemos podido preparar tu pase. Guarda tu tarjeta y vuelve a intentarlo; si sigue fallando, escríbenos.",
  espera: "Has pedido el pase muchas veces seguidas. Espera un minuto y vuelve a intentarlo.",
  pronto: "Esa cartera aún no está disponible. Mientras tanto, enseña tu QR desde aquí.",
};

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
  const passNotice = typeof query.pase === "string" ? PASS_NOTICES[query.pase] : undefined;
  if (passNotice) {
    return (
      <p role="alert" className="rounded-2xl bg-danger-wash px-4 py-3 text-sm text-danger">
        {passNotice}
      </p>
    );
  }
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

function meetingItems(meetings: Meeting[], card: OwnerCard, demo: boolean): MeetingItem[] {
  const now = new Date();
  const owner = { id: card.id, name: card.fullName, slug: card.slug, email: null };
  return meetings.map((meeting) => ({
    view: toMeetingView(meeting, owner, "owner", now),
    // Every demo sample has its own page (/reunion/demo…/anfitrion).
    href: demo ? (isDemoMeetingId(meeting.id) ? `/reunion/${meeting.id}/anfitrion` : null) : meetingPath(meeting.id, "owner"),
  }));
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
          meetings={{ available: true, items: meetingItems(demoOwnerMeetings(new Date()), DEMO_CARD, true) }}
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

  const [stats, contacts, meetings] = await Promise.all([
    getOwnStats(supabase),
    listOwnContactRequests(supabase),
    listOwnMeetings(supabase),
  ]);
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
        meetings={{ available: meetings.available, items: meetingItems(meetings.meetings, card, false) }}
        wallet={wallet}
        siteUrl={getSiteUrl()}
        email={user.email}
        demo={false}
        welcome={await welcomeFor(query, card, wallet, false)}
      />
    </>
  );
}
