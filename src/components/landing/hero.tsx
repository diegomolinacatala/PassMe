import { ArrowUpRight } from "lucide-react";
import { BrandMotif } from "@/components/brand/brand-motif";
import { TiltCard } from "@/components/card/tilt-card";
import { WalletPass } from "@/components/card/wallet-pass";
import { LinkButton } from "@/components/ui/button";
import type { PublicCard } from "@/lib/card/types";

interface HeroProps {
  card: PublicCard;
  ctaHref: string;
}

/**
 * The hero is the object: the pass, big, tipping toward the pointer (or with
 * the phone), its lines drawing themselves in. The QR on it is real (it opens
 * /u/demo), so on a computer we invite people to scan it.
 */
export function Hero({ card, ctaHref }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-12 px-5 pt-6 pb-20 sm:px-8 lg:grid-cols-12 lg:gap-6 lg:pt-12 lg:pb-28">
        <div className="animate-rise lg:col-span-6">
          <p className="eyebrow flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-signal" aria-hidden="true" />
            Pásame tu contacto
          </p>
          <h1
            id="hero-title"
            className="mt-6 font-display text-[length:var(--text-hero)] leading-[0.88] tracking-[-0.02em] text-balance"
          >
            Tu tarjeta de visita, <em className="text-signal">en la cartera</em> del móvil.
          </h1>
          <p className="mt-7 max-w-md text-lg leading-relaxed text-ink-soft sm:text-xl">
            Enseñas un QR y tu contacto aparece en su móvil, sea iPhone o Android. Sin apps. Sin teclear nada.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
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
          <p className="eyebrow mt-10 flex flex-wrap gap-x-3 gap-y-1">
            <span>Gratis</span>
            <span aria-hidden="true">·</span>
            <span>Lista en 2 minutos</span>
            <span aria-hidden="true">·</span>
            <span>Cualquier móvil con cámara</span>
          </p>
        </div>

        <div className="relative animate-rise [animation-delay:150ms] lg:col-span-6">
          <HeroPass card={card} />
        </div>
      </div>
    </section>
  );
}

function HeroPass({ card }: { card: PublicCard }) {
  return (
    <div className="relative mx-auto w-[320px] sm:w-[380px] xl:w-[420px]" aria-label="Ejemplo de tarjeta PassMe en Apple Wallet">
      <BrandMotif
        size={960}
        seed={48213}
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 opacity-45"
      />
      <TiltCard askMotion className="crop-marks">
        <WalletPass card={card} className="max-w-none" />
        {/* Scanner line sweeping the QR. */}
        <span
          className="pointer-events-none absolute bottom-[2.25rem] left-1/2 h-[2px] w-[132px] -translate-x-1/2 animate-scan bg-signal shadow-[0_0_12px_2px_rgb(228_87_42/0.55)] [--scan-distance:-104px]"
          aria-hidden="true"
        />
      </TiltCard>
      <p className="mt-10 hidden text-center font-medium text-ink lg:block">Pruébalo: escanéalo con tu móvil →</p>
    </div>
  );
}
