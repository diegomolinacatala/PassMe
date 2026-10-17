import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { QrCode } from "@/components/card/qr-code";
import { CreateFlow, type CreateMode, type Referrer } from "@/components/create/create-flow";
import { DEFAULT_TYPEFACE, pickInitialTheme, randomPatternSeed } from "@/lib/card/design";
import { parseDesignQuery } from "@/lib/card/design-query";
import { DEFAULT_PATTERN } from "@/lib/card/pattern";
import { parseFromSlug, parseVia } from "@/lib/card/quick";
import { isGoogleWalletLive } from "@/lib/config.server";
import { findOwnerCard, getPublicCard } from "@/lib/data/cards";
import { getSiteUrl, getTurnstileSiteKey, isGoogleAuthEnabled } from "@/lib/env";
import { detectPlatform } from "@/lib/platform";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export function generateMetadata(): Metadata {
  return {
    title: "Crea tu tarjeta",
    description: isGoogleWalletLive()
      ? "Tu tarjeta de visita en Apple Wallet y Google Wallet en un minuto. Gratis y sin instalar nada."
      : "Tu tarjeta de visita en la cartera del móvil en un minuto. Gratis y sin instalar nada.",
    alternates: { canonical: "/crear" },
  };
}

export default async function CreateCardPage({ searchParams }: PageProps<"/crear">) {
  const query = await searchParams;
  const from = parseFromSlug(query.de);
  const via = from ? parseVia(query.via) : "direct";

  const supabase = await createServerSupabase();
  const user = supabase ? await getSessionUser(supabase) : null;
  if (supabase && user) {
    // Already has a card: nothing to create, straight to the editor.
    const card = await findOwnerCard(supabase, user.id);
    if (card?.fullName) redirect("/dashboard");
  }
  const mode: CreateMode = !supabase ? "demo" : user ? "member" : "guest";

  const card = from ? await getPublicCard(from) : null;
  const referrer: Referrer | null = card ? { slug: card.slug, fullName: card.fullName, avatarUrl: card.avatarUrl } : null;
  const platform = detectPlatform((await headers()).get("user-agent"));
  // A design picked on the landing ("Hazla tuya") or, without one, a random color and variation.
  const chosen = parseDesignQuery(query);
  const initialDesign = {
    theme: chosen?.theme ?? pickInitialTheme(card).id,
    pattern: chosen?.pattern ?? DEFAULT_PATTERN,
    typeface: chosen?.typeface ?? DEFAULT_TYPEFACE,
    patternSeed: chosen?.patternSeed || randomPatternSeed(),
  };
  // Android only sees a Google pass once Google Wallet works (D4); until then, "Mi QR".
  const googlePass = platform === "android" && isGoogleWalletLive();
  // The card's link doesn't exist yet (nor is its handle claimed): the preview's QR is a
  // stand-in drawn here, on the server, so the qrcode library stays out of this page's bundle.
  const previewQr = <QrCode value={`${getSiteUrl()}/crear`} label="Código QR de la tarjeta" className="size-[112px] text-ink" quietZone={1} />;

  return (
    <main className="min-h-dvh">
      <header className="mx-auto flex h-20 max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <Logo />
        {mode === "member" ? (
          // Signed in with the wrong account (e.g. Google picked another one): a way out.
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
              Cerrar sesión
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted">
            <span className="max-sm:hidden">¿Ya tienes tarjeta? </span>
            <Link href="/login" className="font-medium text-ink underline underline-offset-4 hover:text-signal-deep">
              Entrar
            </Link>
          </p>
        )}
      </header>
      <div className="pt-4 sm:pt-10">
        <CreateFlow
          mode={mode}
          from={card ? card.slug : from}
          via={via}
          referrer={referrer}
          initialDesign={initialDesign}
          designChosen={chosen !== null}
          accountEmail={user?.email ?? null}
          previewStyle={googlePass ? "google" : "apple"}
          previewQr={previewQr}
          previewWallet={platform === "android" && !googlePass ? null : googlePass ? "Google Wallet" : "Apple Wallet"}
          platform={platform}
          googleEnabled={mode !== "demo" && isGoogleAuthEnabled()}
          captchaSiteKey={getTurnstileSiteKey()}
        />
      </div>
    </main>
  );
}
