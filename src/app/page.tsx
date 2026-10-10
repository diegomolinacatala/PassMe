import { CircleCheck } from "lucide-react";
import { Configurator } from "@/components/landing/configurator";
import { Hero } from "@/components/landing/hero";
import { AlwaysUpdated, FinalCta, PrivacySection, QuickQuestions } from "@/components/landing/sections";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { Storyboard } from "@/components/landing/storyboard";
import { DEMO_CARD } from "@/lib/card/demo";
import { DEFAULT_TYPEFACE, randomPatternSeed } from "@/lib/card/design";
import { DEFAULT_PATTERN } from "@/lib/card/pattern";
import { isGoogleWalletLive } from "@/lib/config.server";
import { toPublicCard } from "@/lib/data/cards";
import { hasSessionCookie } from "@/lib/supabase/server";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  // The card first, the email at the end (demo mode simulates the code).
  const ctaHref = "/crear";
  const demo = toPublicCard(DEMO_CARD);
  // deleteAccountAction lands here after erasing everything.
  const accountDeleted = (await searchParams).cuenta === "borrada";
  // Google Wallet isn't promised until people can actually add the pass (GOOGLE_WALLET_LIVE).
  const googleWallet = isGoogleWalletLive();
  // A cookie check, no network call: enough to choose "Mi tarjeta" over "Entrar".
  const signedIn = !accountDeleted && (await hasSessionCookie());
  // "Hazla tuya" starts on the sample's color with a fresh variation (picked here so it hydrates as rendered).
  const playground = { theme: "naranja", pattern: DEFAULT_PATTERN, typeface: DEFAULT_TYPEFACE, patternSeed: randomPatternSeed() };

  return (
    <>
      <SiteHeader ctaHref={ctaHref} signedIn={signedIn} />
      <main>
        {accountDeleted ? (
          <div className="mx-auto max-w-[1240px] px-5 pt-4 sm:px-8">
            <p role="status" className="flex items-start gap-2.5 rounded-2xl bg-ok/10 px-4 py-3 text-sm text-ok">
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Tu cuenta y tu tarjeta se han borrado. Gracias por probar PassMe.
            </p>
          </div>
        ) : null}
        <Hero card={demo} ctaHref={ctaHref} />
        <Storyboard card={demo} googleWallet={googleWallet} />
        <Configurator base={demo} initialDesign={playground} />
        <PrivacySection />
        <AlwaysUpdated card={demo} googleWallet={googleWallet} />
        <QuickQuestions />
        <FinalCta ctaHref={ctaHref} googleWallet={googleWallet} />
      </main>
      <SiteFooter googleWallet={googleWallet} />
    </>
  );
}
