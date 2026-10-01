import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { BrandMotif } from "@/components/brand/brand-motif";
import { Mark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { createPath } from "@/lib/card/quick";

/**
 * "Crea la tuya" on a public card: whoever just scanned a QR is one tap away
 * from their own. The top bar is always in sight; the closing block explains.
 */

export function CreateYoursBar({ slug }: { slug: string }) {
  return (
    <nav aria-label="PassMe" className="mb-4 flex items-center justify-between gap-3">
      <Link href="/" className="group inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-ink" aria-label="PassMe, inicio">
        <Mark className="size-6 transition-transform duration-500 group-hover:-rotate-6" />
        <span className="font-display text-lg leading-none tracking-tight">
          Pass<span className="text-signal italic">Me</span>
        </span>
      </Link>
      <Link
        href={createPath(slug)}
        className={buttonClasses({ variant: "ink", size: "sm", className: "pr-4 pl-3 shadow-soft" })}
      >
        <Plus className="size-4" aria-hidden />
        Crea la tuya gratis
      </Link>
    </nav>
  );
}

export function CreateYoursCta({ slug, ownerName }: { slug: string; ownerName: string }) {
  const firstName = ownerName.split(/\s+/)[0] || ownerName;
  return (
    <section
      aria-labelledby="crea-la-tuya"
      className="relative isolate mt-5 overflow-hidden rounded-[28px] bg-ink px-6 pt-7 pb-6 text-paper shadow-object"
    >
      <BrandMotif
        color={BRAND.glow}
        pattern="halo"
        size={460}
        seed={20_714}
        className="pointer-events-none absolute -top-44 -right-40 -z-10 opacity-30"
      />
      <p className="eyebrow text-paper/60">¿Y tú?</p>
      <h2 id="crea-la-tuya" className="mt-2 font-display text-[2.2rem] leading-[0.95] tracking-tight">
        Ten tu tarjeta así <em className="text-glow">en un minuto.</em>
      </h2>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-paper/80">
        Como la de {firstName}: vive en la cartera de tu móvil y se comparte con un QR. Gratis y sin instalar nada.
      </p>
      <Link href={createPath(slug)} className={buttonClasses({ variant: "signal", size: "lg", className: "group mt-6 w-full" })}>
        Crear mi tarjeta
        <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
      </Link>
      <p className="mt-3 text-center text-xs text-paper/60">Solo tu nombre, un contacto y tu email.</p>
    </section>
  );
}
