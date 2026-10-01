import { WalletPass } from "@/components/card/wallet-pass";
import { themeDesign } from "@/lib/card/design";
import type { PublicCard } from "@/lib/card/types";

/**
 * Hero object: a phone showing the Apple pass, a Google pass tucked behind,
 * and the side button that you double-press to bring the wallet up.
 */
export function PhoneShowcase({ card }: { card: PublicCard }) {
  const backCard: PublicCard = { ...card, ...themeDesign("cafe", "pliegue", 311_724) };

  return (
    <div className="relative mx-auto w-[300px] sm:w-[330px]" aria-label="Ejemplo de tarjeta PassMe en la cartera del móvil">
      {/* Google pass peeking from behind */}
      <div
        className="absolute top-16 -left-20 hidden w-[270px] animate-float opacity-95 [--tilt:-9deg] sm:block"
        style={{ animationDelay: "-2.5s" }}
        aria-hidden="true"
      >
        <WalletPass card={backCard} style="google" className="scale-[0.92]" />
      </div>

      {/* Phone */}
      <div className="crop-marks relative animate-float [--tilt:3deg]">
        <div className="relative rounded-[52px] bg-ink p-[11px] shadow-object">
          {/* Side button with the double-press hint */}
          <span className="absolute top-36 -right-[5px] h-20 w-[5px] rounded-r-md bg-ink" aria-hidden="true" />
          <span className="absolute top-[9.5rem] -right-[4.75rem] hidden items-center gap-2 lg:flex" aria-hidden="true">
            <span className="relative flex size-3">
              <span className="absolute inset-0 animate-ping rounded-full bg-signal/60" />
              <span className="relative size-3 rounded-full bg-signal" />
            </span>
            <span className="font-mono text-[11px] tracking-[0.14em] text-ink uppercase">×2</span>
          </span>

          <div className="relative overflow-hidden rounded-[42px] bg-paper-deep px-3.5 pt-3 pb-8">
            {/* Status bar + dynamic island */}
            <div className="flex items-center justify-between px-3 pt-1 text-[12px] font-semibold text-ink">
              <span>9:41</span>
              <span className="h-[26px] w-[92px] rounded-full bg-ink" aria-hidden="true" />
              <span className="flex items-center gap-1" aria-hidden="true">
                <span className="h-2.5 w-4 rounded-[3px] border border-ink/80" />
              </span>
            </div>

            <p className="mt-5 px-1 text-[11px] font-semibold tracking-wide text-ink/75 uppercase">Cartera</p>

            <div className="relative mt-2">
              <WalletPass card={card} style="apple" className="max-w-none" />
              {/* Scanner line sweeping the QR */}
              <span
                className="pointer-events-none absolute bottom-[2.25rem] left-1/2 h-[2px] w-[132px] -translate-x-1/2 animate-scan bg-signal shadow-[0_0_12px_2px_rgb(228_87_42/0.55)] [--scan-distance:-104px]"
                aria-hidden="true"
              />
            </div>

            <p className="mt-4 text-center text-[11px] text-ink/75">Acerca el QR a la cámara</p>
          </div>
        </div>
      </div>
    </div>
  );
}
