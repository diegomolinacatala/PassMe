import type { Metadata } from "next";
import { headers } from "next/headers";
import { Logo } from "@/components/brand/logo";
import { WalletPass } from "@/components/card/wallet-pass";
import { buttonClasses } from "@/components/ui/button";
import { AddToWalletButton, passHref } from "@/components/wallet/add-to-wallet-button";
import { getAppleWalletConfig, getGoogleWalletConfig, isGoogleWalletLive } from "@/lib/config.server";
import { toPublicCard } from "@/lib/data/cards";
import { getCardById } from "@/lib/data/wallet";
import { verifyHandoffToken } from "@/lib/pass/handoff";
import { detectPlatform } from "@/lib/platform";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Añadir a la cartera", robots: { index: false } };

function Expired() {
  return (
    <div className="text-center">
      <h1 className="font-display text-4xl leading-none">Este QR ya no vale</h1>
      <p className="mt-3 text-muted">
        Dura 30 minutos. Entra con tu email en este móvil y añade el pase desde ahí.
      </p>
      <a href="/login?next=/dashboard" className={buttonClasses({ variant: "signal", size: "lg", className: "mt-8 w-full" })}>
        Entrar y añadir el pase
      </a>
    </div>
  );
}

/** Landing for the "send to my phone" QR shown in the desktop editor. */
export default async function WalletHandoffPage({ searchParams }: PageProps<"/wallet">) {
  const query = await searchParams;
  const token = typeof query.t === "string" ? query.t : null;
  const profileId = await verifyHandoffToken(token);
  const admin = createAdminSupabase();
  const card = profileId && admin ? await getCardById(admin, profileId) : null;

  const isAndroid = detectPlatform((await headers()).get("user-agent")) === "android";
  const appleReady = getAppleWalletConfig() !== null;
  // Google Wallet is only offered once Google has approved the issuer (GOOGLE_WALLET_LIVE).
  const googleReady = isGoogleWalletLive() && getGoogleWalletConfig() !== null;
  const passQuery = token ? `?t=${encodeURIComponent(token)}` : "";

  const apple = appleReady ? <AddToWalletButton key="apple" wallet="apple" href={passHref("apple", passQuery)} className="mx-auto" /> : null;
  const google = googleReady ? <AddToWalletButton key="google" wallet="google" href={passHref("google", passQuery)} className="mx-auto" /> : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      <Logo />
      <div className="flex flex-1 flex-col justify-center gap-8 py-10">
        {card?.fullName ? (
          <>
            <div className="text-center">
              <p className="eyebrow">Último paso</p>
              <h1 className="mt-2 font-display text-5xl leading-[0.95] tracking-tight">
                Guárdala en <em className="text-signal">tu cartera</em>
              </h1>
            </div>
            <div className="flex justify-center">
              <WalletPass card={toPublicCard(card)} style={isAndroid ? "google" : "apple"} />
            </div>
            <div className="grid gap-3">
              {/* An Android phone can't use an Apple pass. */}
              {isAndroid ? google : [apple, google]}
              {isAndroid && !googleReady ? (
                <p className="text-center text-sm text-muted">Google Wallet llegará muy pronto. Mientras, enseña tu QR desde PassMe.</p>
              ) : null}
              {!isAndroid && !appleReady && !googleReady ? (
                <p className="text-center text-sm text-muted">La cartera no está disponible todavía.</p>
              ) : null}
            </div>
          </>
        ) : (
          <Expired />
        )}
      </div>
    </main>
  );
}
