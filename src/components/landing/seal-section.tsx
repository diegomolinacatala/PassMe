import { WalletPass } from "@/components/card/wallet-pass";
import { DEMO_CARD } from "@/lib/card/demo";
import { CARD_THEMES, themeDesign } from "@/lib/card/design";
import type { PublicCard } from "@/lib/card/types";
import { toPublicCard } from "@/lib/data/cards";

const base = toPublicCard(DEMO_CARD);

/** Fictional people for the stack, back to front. */
const STACK: PublicCard[] = [
  { ...base, ...themeDesign("terracota", "sello", 730_115), fullName: "Jon Etxeberria", company: "Kobalt", headline: "Sales Lead", location: "Bilbao", avatarUrl: null },
  { ...base, ...themeDesign("salvia", "senal", 104_882), fullName: "Lucía Ferrer", company: "Ferrer Arquitectura", headline: "Arquitecta", location: "Madrid", avatarUrl: null },
  { ...base, ...themeDesign("cafe", "ondas", 311_724), fullName: "Marta Gil", company: "Gil & Asociados", headline: "Abogada", location: "Sevilla", avatarUrl: null },
  { ...base, ...themeDesign("naranja", "sello", 48_213) },
];

const SPECS = [
  { value: "10", label: "temas de tinta, o los tuyos" },
  { value: "4", label: "motivos de guilloché" },
  { value: "1", label: "número de sello, solo tuyo" },
];

/**
 * "Tu sello": the brand idea in one section — every card carries a
 * generative guilloché seal, like passports and banknotes.
 */
export function SealSection() {
  return (
    <section id="sello" aria-labelledby="sello-title" className="scroll-mt-10 overflow-x-clip border-t hairline bg-card/60">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-16 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <p className="eyebrow">Tu sello</p>
          <h2 id="sello-title" className="mt-4 font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight">
            Ninguna tarjeta <em className="text-signal">se parece a la tuya.</em>
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
            Cada pase lleva un rosetón de guilloché generado a partir de su número de sello: la misma técnica que
            protege pasaportes y billetes. Elige tintas y motivo, o tira los dados hasta dar con el tuyo.
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
