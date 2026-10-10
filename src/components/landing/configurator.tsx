"use client";

import { ArrowRight, Check, Dices } from "lucide-react";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { initials } from "@/components/card/avatar";
import { containerUnit, CSS_FONTS, editorialLines, PassArt } from "@/components/card/pass-art";
import { TiltCard } from "@/components/card/tilt-card";
import { WalletPass } from "@/components/card/wallet-pass";
import { LinkButton } from "@/components/ui/button";
import { CHOICE_FOCUS, CHOICE_INPUT } from "@/components/ui/choice";
import { inputClasses } from "@/components/ui/field";
import { createWithDesignPath, type ChosenDesign } from "@/lib/card/design-query";
import { CARD_THEMES, randomPatternSeed, resolveDesign, themeDesign, TYPEFACE_LABELS, TYPEFACES, type Typeface } from "@/lib/card/design";
import { rememberName } from "@/lib/card/draft-storage";
import { hasVariations, PATTERN_KINDS, PATTERN_LABELS, type PatternKind } from "@/lib/card/pattern";
import { LIMITS } from "@/lib/card/schema";
import type { PublicCard } from "@/lib/card/types";
import { cn } from "@/lib/cn";

interface ConfiguratorProps {
  /** The sample card: its name and details stand in until a name is typed. */
  base: PublicCard;
  initialDesign: ChosenDesign;
}

/**
 * "Hazla tuya": the landing's own little editor. Type your name, pick a color,
 * a motif and a typeface, and the pass is yours before the card exists;
 * "Crear mi tarjeta con este diseño" carries the choice to /crear.
 */
export function Configurator({ base, initialDesign }: ConfiguratorProps) {
  const [design, setDesign] = useState<ChosenDesign>(initialDesign);
  const [name, setName] = useState("");
  const nameId = useId();
  const typed = name.trim();
  const card: PublicCard = {
    ...base,
    ...themeDesign(design.theme, design.pattern, design.patternSeed, design.typeface),
    fullName: typed || base.fullName,
    // The sample's job, company and photo stay; a stranger's bio doesn't belong under your name.
  };
  const resolved = resolveDesign(card);
  const displayName = typed || base.fullName;
  const update = (patch: Partial<ChosenDesign>) => setDesign((prev) => ({ ...prev, ...patch }));

  return (
    <section id="diseno" aria-labelledby="diseno-title" className="scroll-mt-10 overflow-x-clip border-t hairline bg-card/60">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6">
          <p className="eyebrow">Hazla tuya</p>
          <h2 id="diseno-title" className="mt-4 font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight">
            Ninguna tarjeta <em className="text-signal">se parece a la tuya.</em>
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
            Un color, un motivo que se dibuja solo para ti y la letra de tu nombre. Pruébalo aquí mismo.
          </p>

          <div className="mt-8 space-y-7">
            <div>
              <label htmlFor={nameId} className="block text-sm font-medium text-ink-soft">
                Tu nombre
              </label>
              <input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={base.fullName}
                maxLength={LIMITS.fullName}
                autoComplete="name"
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                className={inputClasses({ className: "mt-1.5 max-w-sm font-display text-xl" })}
              />
            </div>

            <Group label="Color" hint={CARD_THEMES.find((t) => t.id === design.theme)?.name ?? ""}>
              <div role="radiogroup" aria-label="Color de la tarjeta" className="flex flex-wrap gap-2.5">
                {CARD_THEMES.map((theme) => {
                  const active = theme.id === design.theme;
                  return (
                    <label
                      key={theme.id}
                      title={theme.name}
                      className={cn(
                        "relative grid size-10 place-items-center rounded-full shadow-hairline transition-transform duration-300 ease-[var(--ease-spring)] hover:-translate-y-0.5",
                        active && "ring-2 ring-ink ring-offset-2 ring-offset-card",
                        CHOICE_FOCUS,
                      )}
                      style={{ backgroundColor: theme.background }}
                    >
                      <input
                        type="radio"
                        name="landing-theme"
                        value={theme.id}
                        checked={active}
                        onChange={() => update({ theme: theme.id })}
                        aria-label={theme.name}
                        className={CHOICE_INPUT}
                      />
                      <span className="grid size-3.5 place-items-center rounded-full" style={{ backgroundColor: theme.detail }}>
                        {active ? <Check className="size-2.5" style={{ color: theme.background }} aria-hidden /> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </Group>

            <Group label="Motivo" hint={PATTERN_LABELS[design.pattern].name}>
              <div role="radiogroup" aria-label="Motivo de la tarjeta" className="grid grid-cols-4 gap-2 sm:gap-2.5">
                {PATTERN_KINDS.map((kind) => (
                  <MotifChip
                    key={kind}
                    kind={kind}
                    selected={design.pattern === kind}
                    card={card}
                    onSelect={() => update({ pattern: kind })}
                  />
                ))}
              </div>
            </Group>

            <Group label="Letra" hint={TYPEFACE_LABELS[design.typeface].name}>
              <div role="radiogroup" aria-label="Letra del nombre" className="grid grid-cols-4 gap-2 sm:gap-2.5">
                {TYPEFACES.map((typeface) => (
                  <TypefaceChip
                    key={typeface}
                    typeface={typeface}
                    selected={design.typeface === typeface}
                    name={displayName}
                    background={resolved.background}
                    foreground={resolved.foreground}
                    onSelect={() => update({ typeface })}
                  />
                ))}
              </div>
            </Group>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <LinkButton
                href={createWithDesignPath(design)}
                variant="ink"
                size="lg"
                className="group"
                onClick={() => {
                  // The name goes with the draft (this browser only), never in the link.
                  rememberName(typed);
                }}
              >
                Crear mi tarjeta con este diseño
                <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
              </LinkButton>
              <button
                type="button"
                disabled={!hasVariations(design.pattern)}
                onClick={() => update({ patternSeed: randomPatternSeed() })}
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:pointer-events-none disabled:opacity-40"
              >
                <Dices className="size-4" aria-hidden />
                Otra variación
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="lg:sticky lg:top-28">
            <TiltCard className="mx-auto w-[320px] sm:w-[380px]" max={7}>
              <WalletPass card={card} className="max-w-none" />
            </TiltCard>
            <p className="mt-8 text-center text-sm text-muted">Así se vería en Apple Wallet. Cada variación es un dibujo nuevo.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink-soft">{label}</p>
        {hint ? <p className="eyebrow truncate text-right">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

interface MotifChipProps {
  kind: PatternKind;
  selected: boolean;
  card: PublicCard;
  onSelect: () => void;
}

/** The pass strip, drawn with this motif, as the option itself. */
function MotifChip({ kind, selected, card, onSelect }: MotifChipProps) {
  const design = resolveDesign({ ...card, pattern: kind });
  const label = PATTERN_LABELS[kind].name;
  return (
    <label className={cn("group relative flex flex-col gap-1.5 rounded-xl", CHOICE_FOCUS)}>
      <input type="radio" name="landing-motif" checked={selected} onChange={onSelect} aria-label={label} className={CHOICE_INPUT} />
      <span
        className={cn(
          "block overflow-hidden rounded-xl shadow-hairline transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-translate-y-0.5",
          selected && "ring-2 ring-ink ring-offset-2 ring-offset-card",
        )}
        style={{ containerType: "inline-size" }}
        aria-hidden="true"
      >
        <PassArt
          design={design}
          variant="strip"
          name={card.fullName}
          initials={initials(card.fullName)}
          avatarSrc={card.avatarUrl}
          unit={containerUnit}
          fonts={CSS_FONTS}
          deferPattern
        />
      </span>
      <span className={cn("eyebrow truncate text-center", selected && "text-ink")} aria-hidden>
        {label}
      </span>
    </label>
  );
}

interface TypefaceChipProps {
  typeface: Typeface;
  selected: boolean;
  name: string;
  background: string;
  foreground: string;
  onSelect: () => void;
}

function sampleStyle(typeface: Typeface): CSSProperties {
  switch (typeface) {
    case "moderna":
      return { fontFamily: CSS_FONTS.sans, fontWeight: 500, letterSpacing: "-0.03em", fontSize: "1rem" };
    case "cursiva":
      return { fontFamily: CSS_FONTS.serif, fontStyle: "italic", fontSize: "1.35rem" };
    case "clasica":
    case "editorial":
      return { fontFamily: CSS_FONTS.serif, fontSize: "1.35rem" };
  }
}

function TypefaceChip({ typeface, selected, name, background, foreground, onSelect }: TypefaceChipProps) {
  const [first, rest] = editorialLines(name);
  const surname = rest.split(" ")[0] ?? "";
  const label = TYPEFACE_LABELS[typeface].name;
  return (
    <label className={cn("group relative flex flex-col gap-1.5 rounded-xl", CHOICE_FOCUS)}>
      <input type="radio" name="landing-typeface" checked={selected} onChange={onSelect} aria-label={label} className={CHOICE_INPUT} />
      <span
        className={cn(
          "flex h-12 items-center overflow-hidden rounded-xl px-2.5 shadow-hairline transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-translate-y-0.5",
          selected && "ring-2 ring-ink ring-offset-2 ring-offset-card",
        )}
        style={{ backgroundColor: background, color: foreground }}
        aria-hidden="true"
      >
        <span className="truncate leading-none" style={sampleStyle(typeface)}>
          {typeface === "editorial" && surname ? (
            <>
              {first} <em>{surname}</em>
            </>
          ) : (
            first || name
          )}
        </span>
      </span>
      <span className={cn("eyebrow truncate text-center", selected && "text-ink")} aria-hidden>
        {label}
      </span>
    </label>
  );
}
