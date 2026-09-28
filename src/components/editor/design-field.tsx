"use client";

import { Check, Dices, Pipette, Undo2, WandSparkles } from "lucide-react";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { initials } from "@/components/card/avatar";
import { containerUnit, CSS_FONTS, editorialLines, PassArt } from "@/components/card/pass-art";
import { cardPalette, contrastRatio, parseHex, toHex } from "@/lib/card/colors";
import {
  CARD_THEMES,
  randomPatternSeed,
  resolveDesign,
  themeFor,
  TYPEFACE_LABELS,
  TYPEFACES,
  type CardTheme,
  type DesignFields,
  type ResolvedDesign,
  type Typeface,
} from "@/lib/card/design";
import { hasVariations, PATTERN_KINDS, PATTERN_LABELS, type PatternKind } from "@/lib/card/pattern";
import type { PublicCard } from "@/lib/card/types";
import { cn } from "@/lib/cn";

interface DesignFieldProps {
  value: DesignFields;
  /** The card as it looks right now: the options preview the owner's own name and photo. */
  card: PublicCard;
  onChange: (patch: Partial<DesignFields>) => void;
}

/** How many past variations "Anterior" can go back through. */
const MAX_SEED_HISTORY = 20;

/**
 * The "Estilo" section: theme, motif (+ its variation), typeface and custom
 * inks. Every option previews the owner's own card, so choosing feels like
 * making it rather than filling in a form.
 */
export function DesignField({ value, card, onChange }: DesignFieldProps) {
  const design = resolveDesign(value);
  const activeTheme = themeFor(value.accentColor, value.detailColor ?? design.detail);
  const name = card.fullName || "Tu nombre";

  return (
    <div className="space-y-9">
      <Group label="Tema" hint={activeTheme ? activeTheme.name : "Personalizado"}>
        <div role="radiogroup" aria-label="Tema del pase" className="grid grid-cols-5 gap-x-2.5 gap-y-3 sm:gap-x-3">
          {CARD_THEMES.map((theme) => (
            <ThemeSwatch
              key={theme.id}
              theme={theme}
              selected={activeTheme?.id === theme.id}
              onSelect={() => onChange({ accentColor: theme.background, detailColor: theme.detail })}
            />
          ))}
        </div>
      </Group>

      <Group label="Motivo" hint={PATTERN_LABELS[value.pattern].description}>
        <div role="radiogroup" aria-label="Motivo del pase" className="grid grid-cols-2 gap-x-3 gap-y-4">
          {PATTERN_KINDS.map((kind) => (
            <MotifOption
              key={kind}
              kind={kind}
              selected={value.pattern === kind}
              design={design}
              name={name}
              avatarUrl={card.avatarUrl}
              onSelect={() => onChange({ pattern: kind })}
            />
          ))}
        </div>
        <VariationControl
          seed={value.patternSeed}
          enabled={hasVariations(value.pattern)}
          onChange={(patternSeed) => onChange({ patternSeed })}
        />
      </Group>

      <Group label="Letra" hint={TYPEFACE_LABELS[value.typeface].description}>
        <div role="radiogroup" aria-label="Letra del nombre" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TYPEFACES.map((typeface) => (
            <TypefaceOption
              key={typeface}
              typeface={typeface}
              selected={value.typeface === typeface}
              design={design}
              name={name}
              onSelect={() => onChange({ typeface })}
            />
          ))}
        </div>
      </Group>

      <Group label="Tintas a medida" hint={`Texto ${design.isDark ? "blanco" : "oscuro"} automático`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <InkPicker label="Fondo" hex={value.accentColor} onChange={(hex) => onChange({ accentColor: hex })} />
          <InkPicker
            label="Detalle"
            hex={design.detail}
            isAuto={value.detailColor === null}
            warning={detailWarning(value)}
            onChange={(hex) => onChange({ detailColor: hex })}
            onAuto={() => onChange({ detailColor: null })}
          />
        </div>
      </Group>
    </div>
  );
}

function detailWarning(value: DesignFields): string | null {
  if (!value.detailColor) return null;
  const bg = parseHex(value.accentColor);
  const detail = parseHex(value.detailColor);
  if (!bg || !detail) return null;
  return contrastRatio(bg, detail) < 1.6 ? "Casi no se ve sobre el fondo: usamos uno automático." : null;
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint ? <p className="truncate text-right text-xs text-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function ThemeSwatch({ theme, selected, onSelect }: { theme: CardTheme; selected: boolean; onSelect: () => void }) {
  const fg = toHex(cardPalette(theme.background).foreground);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={theme.name}
      onClick={onSelect}
      className="group flex min-w-0 flex-col items-stretch gap-1.5 text-left"
    >
      <span
        className={cn(
          "relative block aspect-[5/4] overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgb(34_27_23/0.12)] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-translate-y-0.5",
          selected && "ring-2 ring-ink ring-offset-2 ring-offset-card",
        )}
        style={{ backgroundColor: theme.background, color: fg }}
      >
        {/* A tiny pass: the photo in its frame and an orbit, in the detail ink. */}
        <span
          className="absolute top-1/2 right-[8%] aspect-square h-[74%] -translate-y-1/2 rounded-full border opacity-60"
          style={{ borderColor: theme.detail }}
          aria-hidden="true"
        />
        <span
          className="absolute top-1/2 right-[19%] aspect-square h-[40%] -translate-y-1/2 rounded-full"
          style={{ backgroundColor: theme.detail }}
          aria-hidden="true"
        />
        <span className="absolute bottom-[18%] left-[12%] h-[7%] w-[30%] rounded-full bg-current opacity-90" aria-hidden="true" />
        {selected ? (
          <span className="absolute top-1.5 left-1.5 grid size-4 place-items-center rounded-full bg-current" aria-hidden="true">
            <Check className="size-3" style={{ color: theme.background }} />
          </span>
        ) : null}
      </span>
      <span className={cn("truncate font-mono text-[10px] tracking-[0.1em] uppercase", selected ? "text-ink" : "text-muted")}>
        {theme.name}
      </span>
    </button>
  );
}

interface MotifOptionProps {
  kind: PatternKind;
  selected: boolean;
  design: ResolvedDesign;
  name: string;
  avatarUrl: string | null;
  onSelect: () => void;
}

/** The owner's own card, drawn with this motif. */
function MotifOption({ kind, selected, design, name, avatarUrl, onSelect }: MotifOptionProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={PATTERN_LABELS[kind].name}
      onClick={onSelect}
      className="group flex min-w-0 flex-col gap-2 text-left"
    >
      <span
        className={cn(
          "block overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgb(34_27_23/0.12)] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-translate-y-0.5",
          selected ? "ring-2 ring-ink ring-offset-2 ring-offset-card" : "opacity-90 group-hover:opacity-100",
        )}
        style={{ containerType: "inline-size" }}
        aria-hidden="true"
      >
        <PassArt
          design={{ ...design, pattern: kind }}
          variant="strip"
          name={name}
          initials={initials(name)}
          avatarSrc={avatarUrl}
          unit={containerUnit}
          fonts={CSS_FONTS}
          deferPattern
        />
      </span>
      <span className="flex items-center gap-1.5">
        {selected ? <Check className="size-3.5 text-ink" aria-hidden /> : null}
        <span className={cn("truncate font-mono text-[10px] tracking-[0.1em] uppercase", selected ? "text-ink" : "text-muted")}>
          {PATTERN_LABELS[kind].name}
        </span>
      </span>
    </button>
  );
}

interface VariationControlProps {
  seed: number;
  enabled: boolean;
  onChange: (seed: number) => void;
}

/** Re-rolls the motif. The seed stays invisible: people pick with their eyes, not by number. */
function VariationControl({ seed, enabled, onChange }: VariationControlProps) {
  const [history, setHistory] = useState<ReadonlyArray<number>>([]);
  const previous = history.at(-1);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3">
      {/* Wide enough to read; below that, the buttons wrap under it. */}
      <div className="min-w-0 flex-[1_1_15rem]">
        <p className="text-sm font-medium text-ink">Variación</p>
        <p className="mt-0.5 text-xs text-muted">
          {enabled
            ? "Cada tirada dibuja tu motivo de otra forma. Nadie más tiene la tuya."
            : "Este motivo es siempre igual: prueba Órbitas, Relieve o Trama para tirar los dados."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!enabled || previous === undefined}
          onClick={() => {
            if (previous === undefined) return;
            setHistory((h) => h.slice(0, -1));
            onChange(previous);
          }}
          aria-label="Volver a la variación anterior"
          title="Anterior"
          className="grid size-10 place-items-center rounded-full border border-line-strong text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <Undo2 className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          disabled={!enabled}
          onClick={() => {
            setHistory((h) => [...h.slice(-(MAX_SEED_HISTORY - 1)), seed]);
            onChange(randomPatternSeed());
          }}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-ink/80 px-4 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-paper disabled:pointer-events-none disabled:opacity-40"
        >
          <Dices className="size-4" aria-hidden />
          Otra variación
        </button>
      </div>
    </div>
  );
}

/** CSS for a typeface sample (the pass itself uses <PassArt>). */
function sampleStyle(typeface: Typeface): CSSProperties {
  switch (typeface) {
    case "moderna":
      return { fontFamily: CSS_FONTS.sans, fontWeight: 500, letterSpacing: "-0.03em", fontSize: "17px" };
    case "cursiva":
      return { fontFamily: CSS_FONTS.serif, fontStyle: "italic", fontSize: "23px" };
    case "clasica":
    case "editorial":
      return { fontFamily: CSS_FONTS.serif, fontSize: "23px" };
  }
}

interface TypefaceOptionProps {
  typeface: Typeface;
  selected: boolean;
  design: ResolvedDesign;
  name: string;
  onSelect: () => void;
}

function TypefaceOption({ typeface, selected, design, name, onSelect }: TypefaceOptionProps) {
  const [first, rest] = editorialLines(name);
  const surname = rest.split(" ")[0] ?? "";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={TYPEFACE_LABELS[typeface].name}
      onClick={onSelect}
      className="group flex min-w-0 flex-col gap-1.5 text-left"
    >
      <span
        className={cn(
          "flex h-16 items-center overflow-hidden rounded-xl px-3 shadow-[inset_0_0_0_1px_rgb(34_27_23/0.12)] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-translate-y-0.5",
          selected && "ring-2 ring-ink ring-offset-2 ring-offset-card",
        )}
        style={{ backgroundColor: design.background, color: design.foreground }}
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
      <span className={cn("truncate font-mono text-[10px] tracking-[0.1em] uppercase", selected ? "text-ink" : "text-muted")}>
        {TYPEFACE_LABELS[typeface].name}
      </span>
    </button>
  );
}

interface InkPickerProps {
  label: string;
  hex: string;
  onChange: (hex: string) => void;
  isAuto?: boolean;
  onAuto?: () => void;
  warning?: string | null;
}

function InkPicker({ label, hex, onChange, isAuto, onAuto, warning }: InkPickerProps) {
  const id = useId();
  const current = hex.toUpperCase();
  return (
    <div className="rounded-2xl border border-line bg-card px-3 py-2.5">
      <div className="flex items-center gap-3">
        <label
          htmlFor={id}
          className="relative grid size-10 shrink-0 cursor-pointer place-items-center rounded-full shadow-[inset_0_0_0_1px_rgb(34_27_23/0.15)] focus-within:ring-2 focus-within:ring-signal focus-within:ring-offset-2"
          style={{ backgroundColor: current, color: toHex(cardPalette(current).foreground) }}
        >
          <Pipette className="size-4" aria-hidden />
          <input
            id={id}
            type="color"
            value={current.toLowerCase()}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            aria-label={`Color de ${label.toLowerCase()}`}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="font-mono text-[11px] tracking-wide text-muted uppercase">{isAuto ? `Auto · ${current}` : current}</p>
        </div>
        {onAuto ? (
          <button
            type="button"
            onClick={onAuto}
            aria-pressed={isAuto}
            title="Elegir el detalle automáticamente"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              isAuto ? "bg-ink text-paper" : "border border-line-strong text-ink-soft hover:border-ink hover:text-ink",
            )}
          >
            <WandSparkles className="size-3.5" aria-hidden />
            Auto
          </button>
        ) : null}
      </div>
      {warning ? <p className="mt-2 text-xs text-danger">{warning}</p> : null}
    </div>
  );
}
