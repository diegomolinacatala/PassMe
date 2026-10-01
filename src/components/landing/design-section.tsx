import { WalletPass } from "@/components/card/wallet-pass";
import { DEMO_CARD } from "@/lib/card/demo";
import { CARD_THEMES, themeDesign, TYPEFACES } from "@/lib/card/design";
import { PATTERN_KINDS } from "@/lib/card/pattern";
import type { PublicCard } from "@/lib/card/types";
import { toPublicCard } from "@/lib/data/cards";

const base = toPublicCard(DEMO_CARD);

/** Fictional people for the stack, back to front. */
const STACK: PublicCard[] = [
  { ...base, ...themeDesign("terracota", "persiana", 730_115, "moderna"), fullName: "Jon Etxeberria", company: "Kobalt", headline: "Sales Lead", location: "Bilbao", avatarUrl: null },
  { ...base, ...themeDesign("salvia", "corriente", 104_882, "cursiva"), fullName: "Lucía Ferrer", company: "Ferrer Arquitectura", headline: "Arquitecta", location: "Madrid", avatarUrl: null },
  { ...base, ...themeDesign("cafe", "halo", 311_724, "editorial"), fullName: "Marta Gil", company: "Gil & Asociados", headline: "Abogada", location: "Sevilla", avatarUrl: null },
  { ...base, ...themeDesign("naranja", "arco", 48_213) },
];

const SPECS = [
  { value: String(CARD_THEMES.length), label: "temas de color, o los tuyos" },
  { value: String(PATTERN_KINDS.length), label: "motivos, cada uno con infinitas variaciones" },
  { value: String(TYPEFACES.length), label: "letras para tu nombre" },
];

/**
 * "Tu diseño": the brand idea in one section — every card is drawn for its
 * owner: motif, variation, inks and typeface.
 */
export function DesignSection() {
  return (
    <section id="diseno" aria-labelledby="diseno-title" className="scroll-mt-10 overflow-x-clip border-t hairline bg-card/60">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-16 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <p className="eyebrow">Tu diseño</p>
          <h2 id="diseno-title" className="mt-4 font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight">
            Ninguna tarjeta <em className="text-signal">se parece a la tuya.</em>
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
            Elige un motivo —un arco, la luz de una persiana, tu monograma…—, las tintas y la letra de tu nombre. Cada motivo se
            dibuja solo para ti: tira los dados hasta dar con tu variación.
          </p>

          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t hairline pt-6">
            {SPECS.map((spec) => (
              <div key={spec.label}>
                <dt className="sr-only">{spec.label}</dt>
                <dd className="font-display text-4xl leading-none text-signal">{spec.value}</dd>
                <dd className="mt-1.5 text-xs leading-snug text-muted">{spec.label}</dd>
              </div>
            ))}
          </dl>

          <ul className="mt-10 flex max-w-md flex-wrap gap-2" aria-label="Temas disponibles">
            {CARD_THEMES.map((theme) => (
              <li
                key={theme.id}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-card py-1 pr-3 pl-1 font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase"
              >
                <span
                  className="grid size-5 place-items-center rounded-full"
                  style={{ backgroundColor: theme.background }}
                  aria-hidden="true"
                >
                  <span className="size-2.5 rounded-full border" style={{ borderColor: theme.detail }} />
                </span>
                {theme.name}
              </li>
            ))}
          </ul>
        </div>

        {/* A Wallet-style stack: each pass peeks out above the next one. */}
        <div className="relative mx-auto w-full max-w-[380px] lg:col-span-6 lg:col-start-7" aria-hidden="true">
          <div className="flex flex-col">
            {STACK.map((card, index) => {
              const isFront = index === STACK.length - 1;
              return (
                <div
                  key={card.fullName}
                  className={
                    isFront
                      ? "relative"
                      : "group relative h-[74px] transition-[height] duration-500 ease-[var(--ease-out-expo)] hover:h-[150px] sm:h-[84px]"
                  }
                  style={{ zIndex: index }}
                >
                  <div
                    className={isFront ? "" : "absolute inset-x-0 top-0 transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:-translate-y-2"}
                  >
                    <WalletPass card={card} className="max-w-none" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
