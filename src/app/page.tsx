import { ArrowUpRight, CircleCheck } from "lucide-react";
import { BrandMotif } from "@/components/brand/brand-motif";
import { PhoneShowcase } from "@/components/landing/phone-showcase";
import { DesignSection } from "@/components/landing/design-section";
import { AlwaysUpdated, ContactMarquee, FinalCta, HowItWorks, PrivacySection, QuickQuestions } from "@/components/landing/sections";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { LinkButton } from "@/components/ui/button";
import { DEMO_CARD } from "@/lib/card/demo";
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

  return (
    <>
      <SiteHeader ctaHref={ctaHref} signedIn={signedIn} />
      <main>
        {accountDeleted ? (
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
            <p role="status" className="flex items-start gap-2.5 rounded-2xl bg-ok/10 px-4 py-3 text-sm text-ok">
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Tu cuenta y tu tarjeta se han borrado. Gracias por probar PassMe.
            </p>
          </div>
        ) : null}
        <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
          <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-16 px-5 pt-8 pb-24 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:pt-14 lg:pb-32">
            <div className="animate-rise lg:col-span-7">
              <p className="eyebrow flex items-center gap-2">
                <span className="inline-block size-1.5 rounded-full bg-signal" aria-hidden="true" />
                {googleWallet ? "Pásame tu contacto · Apple Wallet & Google Wallet" : "Pásame tu contacto · Apple Wallet y QR"}
              </p>
              <h1
                id="hero-title"
                className="mt-6 font-display text-[length:var(--text-hero)] leading-[0.88] tracking-[-0.02em] text-balance"
              >
                Tu tarjeta de visita, <em className="text-signal">en la cartera</em> del móvil.
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-soft sm:text-xl">
                Enseñas un QR y tu contacto aparece en su móvil, sea iPhone o Android. Nadie instala nada, y tú eliges qué
                datos se ven.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <LinkButton href={ctaHref} variant="signal" size="lg">
                  Crear mi tarjeta
                </LinkButton>
                <LinkButton href="/u/demo" variant="ghost" size="lg" className="group">
                  Ver un ejemplo
                  <ArrowUpRight
                    className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden
                  />
                </LinkButton>
              </div>
              <dl className="mt-14 grid max-w-lg grid-cols-3 gap-6 border-t hairline pt-6">
                {[
                  ["2 min", "para crearla"],
                  ["0 apps", "que instalar"],
                  ["100%", "tú decides qué se ve"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt className="sr-only">{label}</dt>
                    <dd className="font-display text-3xl leading-none">{value}</dd>
                    <dd className="mt-1.5 text-xs leading-snug text-muted">{label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="relative animate-rise [animation-delay:150ms] lg:col-span-5">
              <BrandMotif
                size={820}
                seed={48213}
                className="pointer-events-none absolute top-1/2 left-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 opacity-45"
              />
              <PhoneShowcase card={demo} googleWallet={googleWallet} />
            </div>
          </div>
        </section>

        <ContactMarquee />
        <HowItWorks googleWallet={googleWallet} />
        <DesignSection />
        <PrivacySection />
        <AlwaysUpdated card={demo} googleWallet={googleWallet} />
        <QuickQuestions />
        <FinalCta ctaHref={ctaHref} googleWallet={googleWallet} />
      </main>
      <SiteFooter googleWallet={googleWallet} />
    </>
  );
}
