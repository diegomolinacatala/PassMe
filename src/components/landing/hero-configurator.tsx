"use client";

import { ArrowRight, ArrowUpRight, Check, Dices } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

interface HeroConfiguratorProps {
  /** The sample card: its job, company and details stand in until a name is typed. */
  base: PublicCard;
  initialDesign: ChosenDesign;
}

/**
 * The landing's hero is the card itself, already yours: type your name, pick
 * a color, a motif and a typeface, and "Crear mi tarjeta" carries that design
 * (and, in this browser, the name) into /crear. One screen, one action.
 * On a phone the action stays within thumb's reach in a bar at the bottom
 * whenever the inline button scrolls away.
 */
export function HeroConfigurator({ base, initialDesign }: HeroConfiguratorProps) {
  const [design, setDesign] = useState<ChosenDesign>(initialDesign);
  const [name, setName] = useState("");
  const nameId = useId();
  const typed = name.trim();
  const card: PublicCard = {
    ...base,
    ...themeDesign(design.theme, design.pattern, design.patternSeed, design.typeface),
    fullName: typed || base.fullName,
  };
  const resolved = resolveDesign(card);
  const displayName = typed || base.fullName;
  const theme = CARD_THEMES.find((t) => t.id === design.theme) ?? CARD_THEMES[0]!;
  const href = createWithDesignPath(design);
  const update = (patch: Partial<ChosenDesign>) => setDesign((prev) => ({ ...prev, ...patch }));
  // The name goes with the draft (this browser only), never in the link.
  const keepName = () => rememberName(typed);

  // The bottom bar on phones: shown while the inline "Crear mi tarjeta" is off screen.
  const inlineCta = useRef<HTMLDivElement>(null);
  const [ctaOffScreen, setCtaOffScreen] = useState(false);
  useEffect(() => {
    const element = inlineCta.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    // The bar covers the bottom ~80 px: the inline button counts as "in view" only above it.
    const observer = new IntersectionObserver(([entry]) => setCtaOffScreen(!entry?.isIntersecting), {
      threshold: 0.2,
      rootMargin: "0px 0px -80px 0px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="diseno" aria-labelledby="hero-title" className="relative isolate overflow-x-clip">
      <div
        className={cn(
          "mx-auto grid max-w-[1240px] grid-cols-1 gap-y-7 px-5 pt-5 pb-14 sm:px-8 lg:gap-x-12 lg:pt-12 lg:pb-24",
          "[grid-template-areas:'title'_'name'_'pass'_'options'_'cta'] lg:grid-cols-[minmax(0,1fr)_440px] lg:[grid-template-areas:'title_pass'_'name_pass'_'options_pass'_'cta_pass'] lg:[grid-template-rows:auto_auto_auto_1fr]",
        )}
      >
        <div className="[grid-area:title]">
          <h1 id="hero-title" className="font-display text-[length:var(--text-display)] leading-[0.92] tracking-[-0.02em] text-balance lg:text-[length:var(--text-hero)] lg:leading-[0.88]">
            Tu tarjeta de visita, <em className="text-signal">en la cartera</em> del móvil.
          </h1>
          <p className="mt-4 max-w-md text-body leading-relaxed text-ink-soft lg:mt-6 lg:text-lg">
            Enseñas un QR y tu contacto aparece en su móvil, sea iPhone o Android. Sin apps.
          </p>
        </div>

        <div className="[grid-area:name]">
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
            enterKeyHint="done"
            className={inputClasses({ className: "mt-1.5 max-w-sm font-display text-xl" })}
          />
        </div>

        <div className="[grid-area:pass] lg:sticky lg:top-24 lg:self-start">
          <TiltCard className="mx-auto w-[300px] sm:w-[360px] lg:w-[420px]">
            <WalletPass card={card} className="max-w-none" />
          </TiltCard>
          <p className="mt-10 hidden text-center font-medium text-ink lg:block">Pruébalo: escanéalo con tu móvil →</p>
        </div>

        <div className="space-y-6 [grid-area:options]">
          <Group label="Color" hint={theme.name}>
            <div role="radiogroup" aria-label="Color de la tarjeta" className="flex flex-wrap gap-2.5">
              {CARD_THEMES.map((option) => {
                const active = option.id === design.theme;
                return (
                  <label
                    key={option.id}
                    title={option.name}
                    className={cn(
                      "relative grid size-11 place-items-center rounded-full shadow-hairline transition-transform duration-200 ease-[var(--ease-spring)] hover:-translate-y-0.5",
                      active && "ring-2 ring-ink ring-offset-2 ring-offset-paper",
                      CHOICE_FOCUS,
                    )}
                    style={{ backgroundColor: option.background }}
                  >
                    <input
                      type="radio"
                      name="landing-theme"
                      value={option.id}
                      checked={active}
                      onChange={() => update({ theme: option.id })}
                      aria-label={option.name}
                      className={CHOICE_INPUT}
                    />
                    <span className="grid size-3.5 place-items-center rounded-full" style={{ backgroundColor: option.detail }}>
                      {active ? <Check className="size-2.5" style={{ color: option.background }} aria-hidden /> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </Group>

          <Group
            label="Motivo"
            hint={PATTERN_LABELS[design.pattern].name}
            aside={
              <button
                type="button"
                disabled={!hasVariations(design.pattern)}
                onClick={() => update({ patternSeed: randomPatternSeed() })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:pointer-events-none disabled:opacity-40"
              >
                <Dices className="size-4" aria-hidden />
                Otra variación
              </button>
            }
          >
            {/* Phones: a strip to swipe through, one chip after another. Computers: the eight at once. */}
            <div
              role="radiogroup"
              aria-label="Motivo de la tarjeta"
              className="-mx-5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {PATTERN_KINDS.map((kind) => (
                <MotifChip key={kind} kind={kind} selected={design.pattern === kind} card={card} onSelect={() => update({ pattern: kind })} />
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
        </div>

        <div ref={inlineCta} className="[grid-area:cta]">
          <div className="flex flex-wrap items-center gap-3">
            <LinkButton href={href} variant="signal" size="lg" className="group max-sm:w-full" onClick={keepName}>
              Crear mi tarjeta
              <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
            </LinkButton>
            <LinkButton href="/u/demo" variant="ghost" size="lg" className="group max-sm:w-full">
              Ver un ejemplo
              <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
            </LinkButton>
          </div>
          <p className="eyebrow mt-5">Gratis · Con este diseño · En un minuto</p>
        </div>
      </div>

      {/* Phones: the way in, always within reach. */}
      <div
        aria-hidden={!ctaOffScreen}
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t hairline bg-paper/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md transition-transform duration-300 ease-[var(--ease-out-expo)] lg:hidden",
          ctaOffScreen ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
      >
        <div className="mx-auto flex max-w-[640px] items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full shadow-hairline" style={{ backgroundColor: theme.background }} aria-hidden="true">
            <span className="size-3.5 rounded-full" style={{ backgroundColor: theme.detail }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{displayName}</span>
            <span className="eyebrow block truncate">
              {theme.name} · {PATTERN_LABELS[design.pattern].name}
            </span>
          </span>
          <Link
            href={href}
            onClick={keepName}
            tabIndex={ctaOffScreen ? 0 : -1}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-paper shadow-press-ink"
          >
            Crear mi tarjeta
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Group({ label, hint, aside, children }: { label: string; hint?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-soft">
          {label}
          {hint ? <span className="eyebrow ml-2 normal-case tracking-normal">{hint}</span> : null}
        </p>
        {aside}
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
    <label className={cn("group relative flex w-[132px] shrink-0 snap-start flex-col gap-1.5 rounded-xl lg:w-auto", CHOICE_FOCUS)}>
      <input type="radio" name="landing-motif" checked={selected} onChange={onSelect} aria-label={label} className={CHOICE_INPUT} />
      <span
        className={cn(
          "block overflow-hidden rounded-xl shadow-hairline transition-transform duration-200 ease-[var(--ease-spring)] group-hover:-translate-y-0.5",
          selected && "ring-2 ring-ink ring-offset-2 ring-offset-paper",
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
          "flex h-12 items-center overflow-hidden rounded-xl px-2.5 shadow-hairline transition-transform duration-200 ease-[var(--ease-spring)] group-hover:-translate-y-0.5",
          selected && "ring-2 ring-ink ring-offset-2 ring-offset-paper",
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
