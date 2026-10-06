import type { Metadata, Viewport } from "next";
import { X } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { QrCode } from "@/components/card/qr-code";
import { HomeScreenHint } from "@/components/dashboard/home-screen-hint";
import { ScreenWakeLock } from "@/components/dashboard/screen-wake-lock";
import { ShareLinkButton } from "@/components/ui/share-link-button";
import { DEMO_CARD } from "@/lib/card/demo";
import type { OwnerCard } from "@/lib/card/types";
import { getGoogleWalletConfig, isGoogleWalletLive } from "@/lib/config.server";
import { findOwnerCard } from "@/lib/data/cards";
import { prettyProfileUrl, profileUrl } from "@/lib/env";
import { detectPlatform, homeScreenHint } from "@/lib/platform";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mi QR", robots: { index: false } };
// White all the way up: the browser bar matches the page around the QR.
export const viewport: Viewport = { themeColor: "#ffffff" };

/** The saved card (never an unsaved draft): demo card without Supabase, login without a session. */
async function savedCard(): Promise<OwnerCard> {
  const supabase = await createServerSupabase();
  if (!supabase) return DEMO_CARD;
  const user = await getSessionUser(supabase);
  if (!user) redirect("/login?next=/dashboard/qr");
  const card = await findOwnerCard(supabase, user.id);
  if (!card?.fullName) redirect("/crear");
  return card;
}

/**
 * "Mi QR": the owner's QR, full screen, to show to whoever is in front of
 * them. Nothing else competes with it: no site header, no save bar. The
 * manifest's start_url, so pinning PassMe to the home screen opens it here.
 */
export default async function MyQrPage() {
  const card = await savedCard();
  const platform = detectPlatform((await headers()).get("user-agent"));
  const hint = homeScreenHint(platform, isGoogleWalletLive() && getGoogleWalletConfig() !== null);

  return (
    <main className="flex min-h-dvh flex-col bg-white text-ink">
      <ScreenWakeLock />
      <div className="flex justify-end px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <a
          href="/dashboard"
          className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          <X className="size-4" aria-hidden /> Cerrar
        </a>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] landscape:max-lg:flex-row landscape:max-lg:gap-10">
        <div className="flex flex-col items-center">
          <h1 className="max-w-[min(82vw,420px)] text-center font-display text-[2.2rem] leading-[0.95] tracking-tight text-balance landscape:max-lg:text-3xl">
            {card.fullName}
          </h1>
          <QrCode
            value={profileUrl(card.slug, "qr")}
            label={`QR de la tarjeta de ${card.fullName}`}
            className="mt-4 size-[min(82vw,420px,68dvh)] text-black"
            quietZone={2}
          />
        </div>

        <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center landscape:max-lg:w-auto">
          <p className="text-body text-ink-soft">Sube el brillo para que se lea a la primera</p>
          <p className="font-mono text-xs tracking-wide text-muted [overflow-wrap:anywhere]">{prettyProfileUrl(card.slug)}</p>
          <ShareLinkButton url={profileUrl(card.slug, "share")} title={`${card.fullName} · PassMe`} variant="outline" />
          {hint ? <HomeScreenHint text={hint} /> : null}
        </div>
      </div>
    </main>
  );
}
