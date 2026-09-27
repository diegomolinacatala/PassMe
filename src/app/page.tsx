import { ArrowUpRight } from "lucide-react";
import { PhoneShowcase } from "@/components/landing/phone-showcase";
import { AlwaysUpdated, ContactMarquee, FinalCta, HowItWorks, PrivacySection } from "@/components/landing/sections";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { LinkButton } from "@/components/ui/button";
import { DEMO_CARD } from "@/lib/card/demo";
import { toPublicCard } from "@/lib/data/cards";
import { isSupabaseConfigured } from "@/lib/env";

export default function HomePage() {
  const ctaHref = isSupabaseConfigured() ? "/login" : "/dashboard";
  const demo = toPublicCard(DEMO_CARD);

  return (
    <>
      <SiteHeader ctaHref={ctaHref} />
      <main>
        <section aria-labelledby="hero-title" className="relative overflow-hidden">
          <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-16 px-5 pt-8 pb-24 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:pt-14 lg:pb-32">
            <div className="animate-rise lg:col-span-7">
              <p className="eyebrow flex items-center gap-2">
                <span className="inline-block size-1.5 rounded-full bg-signal" aria-hidden="true" />
                Tarjeta de visita · Apple Wallet &amp; Google Wallet
              </p>
              <h1
                id="hero-title"
                className="mt-6 font-display text-[length:var(--text-hero)] leading-[0.88] tracking-[-0.02em] text-balance"
              >
                Tu tarjeta de visita, <em className="text-signal">en la cartera</em> del móvil.
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-soft sm:text-xl">
                Doble clic al botón lateral, enseñas el QR y tu contacto aparece en su teléfono. Sin apps que instalar, sin
                papel y sin darle tu número a quien no quieras.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <LinkButton href={ctaHref} variant="signal" size="lg">
                  Crear mi tarjeta gratis
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

            <div className="animate-rise [animation-delay:150ms] lg:col-span-5">
              <PhoneShowcase card={demo} />
            </div>
          </div>
        </section>

        <ContactMarquee />
        <HowItWorks />
        <PrivacySection />
        <AlwaysUpdated card={demo} />
        <FinalCta ctaHref={ctaHref} />
      </main>
      <SiteFooter />
    </>
  );
}
