import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignedInBeacon } from "@/components/auth/session-sync";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { CardEditor } from "@/components/editor/card-editor";
import { WelcomePanel } from "@/components/editor/welcome-panel";
import type { WalletAvailability } from "@/components/editor/wallet-panel";
import { DEMO_CARD, DEMO_CONTACT_REQUESTS } from "@/lib/card/demo";
import { parseFromSlug, parseVia } from "@/lib/card/quick";
import { canSendCard, sendCardDetails, sentDetailsSentence } from "@/lib/card/send-card";
import type { OwnerCard } from "@/lib/card/types";
import { getAppleWalletConfig, getConfigStatus, getGoogleWalletConfig, isGoogleWalletLive } from "@/lib/config.server";
import { EMPTY_STATS, findOwnerCard, getOwnStats, getPublicCard } from "@/lib/data/cards";
import { listOwnContactRequests } from "@/lib/data/contact-requests";
import { listOwnMeetings } from "@/lib/data/meetings";
import type { MeetingItem } from "@/components/editor/meetings-panel";
import { meetingPath } from "@/lib/meetings/links";
import { CONTACTS_SEEN_COOKIE, parseSeenCookie } from "@/lib/pending";
import type { Meeting } from "@/lib/meetings/model";
import { demoOwnerMeetings, isDemoMeetingId, toMeetingView } from "@/lib/meetings/view";
import { getSiteUrl, profileUrl } from "@/lib/env";
import { detectPlatform, type Platform } from "@/lib/platform";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mi tarjeta", robots: { index: false } };

/** What a failed pass download (/api/pass/…, followed as a link) comes back to say. */
const PASS_NOTICES: Record<string, string> = {
  error: "No hemos podido preparar tu pase. Guarda tu tarjeta y vuelve a intentarlo; si sigue fallando, escríbenos.",
  espera: "Has pedido el pase muchas veces seguidas. Espera un minuto y vuelve a intentarlo.",
  pronto: "Esa cartera aún no está disponible. Mientras tanto, enseña tu QR desde aquí.",
};

interface WelcomeContext {
  card: OwnerCard;
  /** The signed-in account's email (null in demo mode). */
  email: string | null;
  wallet: WalletAvailability;
  platform: Platform;
  demo: boolean;
}

/**
 * The just-created card's welcome (?nueva=1), naming whose card led here (?de=…)
 * and adapting to how they got there (?via=…), or a note for an account that
 * went through /crear but already had a card (?existente=1).
 */
async function welcomeFor(query: Record<string, string | string[] | undefined>, { card, email, wallet, platform, demo }: WelcomeContext) {
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
  // The demo account *is* the sample card, which is also where demo visitors come from.
  const referrer = from && (demo || from !== card.slug) ? await getPublicCard(from) : null;
  const details = sendCardDetails(card, email, profileUrl(card.slug));
  const theirName = referrer ? referrer.fullName.split(/\s+/)[0] || referrer.fullName : "";
  return (
    <WelcomePanel
      slug={card.slug}
      fullName={card.fullName}
      qrUrl={profileUrl(card.slug, "qr")}
      shareUrl={profileUrl(card.slug, "share")}
      referrer={referrer ? { slug: referrer.slug, name: referrer.fullName, acceptsContacts: referrer.acceptsContactRequests } : null}
      via={referrer ? parseVia(query.via) : "direct"}
      sendSummary={referrer && canSendCard(details) ? sentDetailsSentence(theirName, details) : null}
      wallet={wallet}
      platform={platform}
      demo={demo}
    />
  );
}

function meetingItems(meetings: Meeting[], card: OwnerCard, demo: boolean): MeetingItem[] {
  const now = new Date();
  const owner = {
    id: card.id,
    name: card.fullName,
    slug: card.slug,
    email: null,
    ...(card.timeZone ? { timeZone: card.timeZone } : {}),
    ...(card.meetingSettings ? { defaults: { videoLink: card.meetingSettings.videoLink, place: card.meetingSettings.place } } : {}),
  };
  return meetings.map((meeting) => ({
    view: toMeetingView(meeting, owner, "owner", now),
    // Every demo sample has its own page (/reunion/demo…/anfitrion).
    href: demo ? (isDemoMeetingId(meeting.id) ? `/reunion/${meeting.id}/anfitrion` : null) : meetingPath(meeting.id, "owner"),
  }));
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const query = await searchParams;
  const supabase = await createServerSupabase();
  const platform = detectPlatform((await headers()).get("user-agent"));
  const contactsSeenAt = parseSeenCookie((await cookies()).get(CONTACTS_SEEN_COOKIE)?.value);
  // Google Wallet only once Google has approved the issuer (D4: GOOGLE_WALLET_LIVE).
  const googleLive = isGoogleWalletLive();

  // Demo mode: no Supabase yet → play with the sample card, nothing persists.
  if (!supabase) {
    const wallet = {
      apple: getAppleWalletConfig() !== null,
      google: googleLive && getGoogleWalletConfig() !== null,
      handoff: false,
    };
    return (
      <>
        <SignedInBeacon />
        <DashboardHeader slug={DEMO_CARD.slug} name={DEMO_CARD.fullName} shareUrl={profileUrl(DEMO_CARD.slug, "share")} />
        <CardEditor
          initialCard={DEMO_CARD}
          stats={EMPTY_STATS}
          contacts={{ available: true, requests: DEMO_CONTACT_REQUESTS, seenAt: contactsSeenAt }}
          meetings={{ available: true, items: meetingItems(demoOwnerMeetings(new Date()), DEMO_CARD, true) }}
          wallet={wallet}
          platform={platform}
          siteUrl={getSiteUrl()}
          email={null}
          demo
          welcome={await welcomeFor(query, { card: DEMO_CARD, email: null, wallet, platform, demo: true })}
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
    google: googleLive && status.googleWallet && status.supabaseSecretKey,
    handoff: status.signingSecret,
  };

  return (
    <>
      <SignedInBeacon />
      <DashboardHeader slug={card.slug} name={card.fullName} shareUrl={profileUrl(card.slug, "share")} />
      <CardEditor
        initialCard={card}
        stats={stats}
        contacts={{ ...contacts, seenAt: contactsSeenAt }}
        meetings={{ available: meetings.available, items: meetingItems(meetings.meetings, card, false) }}
        wallet={wallet}
        platform={platform}
        siteUrl={getSiteUrl()}
        email={user.email}
        demo={false}
        welcome={await welcomeFor(query, { card, email: user.email, wallet, platform, demo: false })}
      />
    </>
  );
}
