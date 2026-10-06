import { ArrowRight, Pencil, Plus, QrCode as QrCodeIcon } from "lucide-react";
import Link from "next/link";
import { BrandMotif } from "@/components/brand/brand-motif";
import { Mark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { createPath } from "@/lib/card/quick";
import type { VisitSource } from "@/lib/env";

/**
 * "Crear mi tarjeta" on a public card: whoever just scanned a QR is one tap
 * away from their own. The top bar is always in sight; the closing block
 * explains. The owner looking at their own card gets "Editar" instead.
 */

interface CreateYoursBarProps {
  slug: string;
  /** How the visitor arrived: travels to /crear so the welcome fits (scanned in person or not). */
  via: VisitSource;
  /** The signed-in owner is looking at their own card. */
  isOwner?: boolean;
}

export function CreateYoursBar({ slug, via, isOwner = false }: CreateYoursBarProps) {
  return (
    <nav aria-label="PassMe" className="mb-4 flex items-center justify-between gap-3">
      <Link href="/" className="group inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-ink" aria-label="PassMe, inicio">
        <Mark className="size-6 transition-transform duration-500 group-hover:-rotate-6" />
        <span className="font-display text-lg leading-none tracking-tight">
          Pass<span className="text-signal italic">Me</span>
        </span>
      </Link>
      {isOwner ? (
        <a href="/dashboard" className={buttonClasses({ variant: "ink", size: "sm", className: "pr-4 pl-3 shadow-soft" })}>
          <Pencil className="size-4" aria-hidden />
          Editar mi tarjeta
        </a>
      ) : (
        <Link href={createPath(slug, via)} className={buttonClasses({ variant: "ink", size: "sm", className: "pr-4 pl-3 shadow-soft" })}>
          <Plus className="size-4" aria-hidden />
          Crear la mía
        </Link>
      )}
    </nav>
  );
}

export function CreateYoursCta({ slug, via, ownerName }: { slug: string; via: VisitSource; ownerName: string }) {
  const firstName = ownerName.split(/\s+/)[0] || ownerName;
  return (
    <section
      aria-labelledby="crea-la-tuya"
      className="relative isolate mt-5 overflow-hidden rounded-object bg-ink px-6 pt-7 pb-6 text-paper shadow-object"
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
      <p className="mt-3 text-body leading-relaxed text-paper/80">
        Como la de {firstName}: vive en la cartera de tu móvil y se comparte con un QR. Gratis y sin instalar nada.
      </p>
      <Link href={createPath(slug, via)} className={buttonClasses({ variant: "signal", size: "lg", className: "group mt-6 w-full" })}>
        Crear mi tarjeta
        <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
      </Link>
      <p className="mt-3 text-center text-xs text-paper/60">Solo tu nombre, un contacto y tu email.</p>
    </section>
  );
}

/** In place of "Crear mi tarjeta" when the owner opens their own card. */
export function OwnCardNote() {
  return (
    <section aria-labelledby="tu-tarjeta" className="mt-5 rounded-object border hairline bg-card/80 px-6 py-5">
      <h2 id="tu-tarjeta" className="font-display text-2xl leading-tight tracking-tight">
        Así la ven <em className="text-signal">los demás.</em>
      </h2>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="/dashboard" className={buttonClasses({ variant: "ink", className: "px-5" })}>
          <Pencil className="size-4" aria-hidden /> Editar
        </a>
        <a href="/dashboard/qr" className={buttonClasses({ variant: "outline", className: "px-5" })}>
          <QrCodeIcon className="size-4" aria-hidden /> Mi QR
        </a>
      </div>
    </section>
  );
}
