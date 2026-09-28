import type { Metadata } from "next";
import { headers } from "next/headers";
import { Logo } from "@/components/brand/logo";
import { WalletPass } from "@/components/card/wallet-pass";
import { buttonClasses } from "@/components/ui/button";
import { getAppleWalletConfig, getGoogleWalletConfig } from "@/lib/config.server";
import { toPublicCard } from "@/lib/data/cards";
import { getCardById } from "@/lib/data/wallet";
import { verifyHandoffToken } from "@/lib/pass/handoff";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Añadir a la cartera", robots: { index: false } };

function Expired() {
  return (
    <div className="text-center">
      <h1 className="font-display text-4xl leading-none">Este enlace ha caducado</h1>
      <p className="mt-3 text-muted">Vuelve al editor en el ordenador y genera un QR nuevo. Duran 30 minutos.</p>
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

  const userAgent = (await headers()).get("user-agent") ?? "";
  const isAndroid = /android/i.test(userAgent);
  const appleReady = getAppleWalletConfig() !== null;
  const googleReady = getGoogleWalletConfig() !== null;
  const t = token ? encodeURIComponent(token) : "";

  const apple = appleReady ? (
    <a key="apple" href={`/api/pass/apple?t=${t}`} className={buttonClasses({ variant: "ink", size: "lg", className: "w-full" })}>
      Añadir a Apple Wallet
    </a>
  ) : null;
  const google = googleReady ? (
    <a
      key="google"
      href={`/api/pass/google?t=${t}`}
      className={buttonClasses({ variant: isAndroid ? "ink" : "outline", size: "lg", className: "w-full" })}
    >
      Añadir a Google Wallet
    </a>
  ) : null;

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
              {isAndroid ? [google, apple] : [apple, google]}
              {!appleReady && !googleReady ? (
                <p className="text-center text-sm text-muted">Las carteras aún no están configuradas en el servidor.</p>
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
