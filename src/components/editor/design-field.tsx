"use client";

import { Check, Dices, Pipette, WandSparkles } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cardPalette, contrastRatio, parseHex, toHex } from "@/lib/card/colors";
import {
  CARD_THEMES,
  randomPatternSeed,
  resolveDesign,
  sealNumber,
  themeFor,
  type CardTheme,
  type DesignFields,
} from "@/lib/card/design";
import { PATTERN_KINDS, PATTERN_LABELS, type PatternKind } from "@/lib/card/pattern";
import { cn } from "@/lib/cn";

interface DesignFieldProps {
  value: DesignFields;
  onChange: (patch: Partial<DesignFields>) => void;
}

/**
 * The "Estilo" section: curated themes, background + detail inks, pattern and
 * the card's seal number. Everything stays editable; themes are shortcuts.
 */
export function DesignField({ value, onChange }: DesignFieldProps) {
  const design = resolveDesign(value);
  const activeTheme = themeFor(value.accentColor, value.detailColor ?? design.detail);

  return (
    <div className="space-y-8">
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

      <Group label="Tintas" hint={`Texto ${design.isDark ? "blanco" : "oscuro"} automático`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <InkPicker
            label="Fondo"
            hex={value.accentColor}
            onChange={(hex) => onChange({ accentColor: hex })}
          />
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

      <Group label="Motivo" hint={PATTERN_LABELS[value.pattern].description}>
        <div role="radiogroup" aria-label="Motivo del pase" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {PATTERN_KINDS.map((kind) => (
            <PatternOption
              key={kind}
              kind={kind}
              selected={value.pattern === kind}
              background={design.background}
              detail={design.detail}
              onSelect={() => onChange({ pattern: kind })}
            />
          ))}
        </div>
      </Group>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">Tu sello</p>
          <p className="mt-0.5 font-mono text-lg tracking-[0.12em] text-ink">{sealNumber(value.patternSeed)}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ patternSeed: randomPatternSeed() })}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-ink/80 px-4 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          <Dices className="size-4" aria-hidden />
          Otro sello
        </button>
        <p className="w-full text-xs text-muted">
          El número genera tu motivo: nadie más tiene el mismo. Cámbialo hasta que te guste.
        </p>
      </div>
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
        {/* A tiny seal: two rings in the detail ink. */}
        <span
          className="absolute top-1/2 right-[12%] aspect-square h-[58%] -translate-y-1/2 rounded-full border"
          style={{ borderColor: theme.detail }}
          aria-hidden="true"
        />
        <span
          className="absolute top-1/2 right-[21%] aspect-square h-[34%] -translate-y-1/2 rounded-full border-2 border-dotted"
          style={{ borderColor: theme.detail }}
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

interface PatternOptionProps {
  kind: PatternKind;
  selected: boolean;
  background: string;
  detail: string;
  onSelect: () => void;
}

function PatternOption({ kind, selected, background, detail, onSelect }: PatternOptionProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-left transition-[border-color,background-color] duration-200",
        selected ? "border-ink bg-card shadow-soft" : "border-line hover:border-line-strong",
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg" style={{ backgroundColor: background }}>
        <PatternGlyph kind={kind} color={detail} />
      </span>
      <span className="text-sm font-medium text-ink">{PATTERN_LABELS[kind].name}</span>
    </button>
  );
}

/** Tiny hand-drawn glyphs: the real patterns are too fine to read at 36px. */
function PatternGlyph({ kind, color }: { kind: PatternKind; color: string }) {
  const common = { fill: "none", stroke: color, strokeWidth: 1.4, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 36 36" className="size-9" aria-hidden="true">
      {kind === "sello" ? (
        <>
          <path {...common} d={rosette(11, 3, 8)} />
          <path {...common} strokeWidth={1} d={rosette(6.5, 1.6, 12)} />
        </>
      ) : null}
      {kind === "ondas" ? (
        <>
          <path {...common} d="M-2 12c5-6 9 6 14 0s9-6 14 0 9 6 14 0" />
          <path {...common} d="M-2 18c5 6 9-6 14 0s9 6 14 0 9-6 14 0" />
          <path {...common} d="M-2 24c5-6 9 6 14 0s9-6 14 0 9 6 14 0" />
        </>
      ) : null}
      {kind === "senal" ? (
        <>
          <circle {...common} cx="18" cy="18" r="4" />
          <circle {...common} cx="18" cy="18" r="8.5" />
          <circle {...common} strokeWidth={1} cx="18" cy="18" r="13" />
        </>
      ) : null}
      {kind === "liso" ? <circle {...common} cx="18" cy="18" r="6" strokeDasharray="2 2.5" /> : null}
    </svg>
  );
}

function rosette(radius: number, amp: number, petals: number): string {
  const points: string[] = [];
  for (let i = 0; i <= 96; i += 1) {
    const t = (i / 96) * Math.PI * 2;
    const r = radius + amp * Math.sin(petals * t);
    points.push(`${(18 + r * Math.cos(t)).toFixed(2)} ${(18 + r * Math.sin(t)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

