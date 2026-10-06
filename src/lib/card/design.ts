import { cardPalette, DEFAULT_ACCENT, mix, toHex } from "./colors";
import { DEFAULT_PATTERN, hashSeed, type PatternKind } from "./pattern";

/**
 * Card design: what the owner can customize about how their pass looks.
 * Shared by the editor, the public page and both wallet generators.
 */

export interface CardTheme {
  id: string;
  name: string;
  /** Pass background (stored as `accentColor`). */
  background: string;
  /** Motif, photo frame and label color (stored as `detailColor`). */
  detail: string;
}

/**
 * Curated themes: warm, soft, paper-and-clay tones (oranges, beiges, browns)
 * plus two muted pastels. Every pair keeps text at WCAG AA (≥ 4.5:1) and the
 * motif visible (≥ 2:1) without shouting.
 */
export const CARD_THEMES: ReadonlyArray<CardTheme> = [
  { id: "naranja", name: "Naranja", background: "#EF7A4A", detail: "#FFE3D1" },
  { id: "melocoton", name: "Melocotón", background: "#F7CDB0", detail: "#C2552A" },
  { id: "papel", name: "Papel", background: "#F6F1E8", detail: "#E4572A" },
  { id: "arena", name: "Arena", background: "#E6D8C2", detail: "#9C5A2E" },
  { id: "caramelo", name: "Caramelo", background: "#C98B5A", detail: "#FBE6D2" },
  { id: "terracota", name: "Terracota", background: "#B5532E", detail: "#F8D3BD" },
  { id: "cafe", name: "Café", background: "#3E2C23", detail: "#F0A574" },
  { id: "tinta", name: "Tinta", background: "#221B17", detail: "#D9CBB8" },
  { id: "salvia", name: "Salvia", background: "#CDD5BD", detail: "#5F6B47" },
  { id: "mostaza", name: "Mostaza", background: "#EFD48C", detail: "#8A5A16" },
];

export const DEFAULT_THEME = CARD_THEMES[0]!;

/** Design fields for a curated theme (showcases, demo cards). Unknown ids fall back to the default. */
export function themeDesign(
  id: string,
  pattern: PatternKind = DEFAULT_PATTERN,
  patternSeed = 0,
  typeface: Typeface = DEFAULT_TYPEFACE,
): DesignFields {
  const theme = CARD_THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
  return { accentColor: theme.background, detailColor: theme.detail, pattern, patternSeed, typeface };
}

export const DEFAULT_DETAIL = DEFAULT_THEME.detail;

/** Typefaces for the name on the pass. */
export const TYPEFACES = ["clasica", "cursiva", "editorial", "moderna"] as const;
export type Typeface = (typeof TYPEFACES)[number];

export const DEFAULT_TYPEFACE: Typeface = "clasica";

export const TYPEFACE_LABELS: Record<Typeface, { name: string; description: string }> = {
  clasica: { name: "Clásica", description: "Serif de revista: la de toda la vida." },
  cursiva: { name: "Cursiva", description: "La misma serif, inclinada. Más personal." },
  editorial: { name: "Editorial", description: "Tu nombre recto y los apellidos en cursiva." },
  moderna: { name: "Moderna", description: "Sin serifa, limpia y directa." },
};

export function isTypeface(value: unknown): value is Typeface {
  return typeof value === "string" && (TYPEFACES as readonly string[]).includes(value);
}

/** Variations are numbered 0–999 999; the number itself is never shown. */
export const PATTERN_SEED_MAX = 999_999;

export function isPatternSeed(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= PATTERN_SEED_MAX;
}

export function randomPatternSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0]! % (PATTERN_SEED_MAX + 1);
  }
  return Math.floor(Math.random() * (PATTERN_SEED_MAX + 1));
}

export function themeFor(background: string, detail: string | null): CardTheme | undefined {
  const bg = background.toUpperCase();
  return CARD_THEMES.find((t) => t.background === bg && (detail === null || t.detail === detail.toUpperCase()));
}

/**
 * The color a new card starts with: any of the themes, but never the one of
 * the card that led here (/crear?de=…) — otherwise every PassMe card ends up
 * looking like the first. `random` returns [0, 1) (injectable for tests).
 */
export function pickInitialTheme(
  referrer: { accentColor: string; detailColor: string | null } | null,
  random: () => number = Math.random,
): CardTheme {
  const avoid = referrer ? themeFor(referrer.accentColor, referrer.detailColor) : undefined;
  const choices = CARD_THEMES.filter((theme) => theme.id !== avoid?.id);
  const value = random();
  const index = Number.isFinite(value) ? Math.min(choices.length - 1, Math.max(0, Math.floor(value * choices.length))) : 0;
  return choices[index]!;
}

/** The design-related fields of a card. */
export interface DesignFields {
  accentColor: string;
  detailColor: string | null;
  pattern: PatternKind;
  patternSeed: number;
  typeface: Typeface;
}

/** Everything a renderer needs, as hex strings. */
export interface ResolvedDesign {
  background: string;
  foreground: string;
  label: string;
  detail: string;
  /** Solid fill for the seal behind initials: the background tinted with the detail ink. */
  seal: string;
  isDark: boolean;
  pattern: PatternKind;
  seed: number;
  typeface: Typeface;
}

export function resolveDesign(fields: DesignFields): ResolvedDesign {
  // A theme background with no explicit detail uses the theme's own pair.
  const detail = fields.detailColor ?? themeFor(fields.accentColor, null)?.detail ?? null;
  const palette = cardPalette(fields.accentColor, detail);
  return {
    background: toHex(palette.background),
    foreground: toHex(palette.foreground),
    label: toHex(palette.label),
    detail: toHex(palette.detail),
    seal: toHex(mix(palette.background, palette.detail, 0.22)),
    isDark: palette.isDark,
    pattern: fields.pattern,
    seed: fields.patternSeed,
    typeface: fields.typeface,
  };
}

/** Short, stable fingerprint of the artwork inputs (cache keys, image URLs). */
export function designVersion(parts: ReadonlyArray<string | number | null | undefined>): string {
  return hashSeed(parts.map((p) => String(p ?? "")).join("|")).toString(36);
}

export const DEFAULT_DESIGN: DesignFields = {
  accentColor: DEFAULT_ACCENT,
  detailColor: DEFAULT_DETAIL,
  pattern: DEFAULT_PATTERN,
  patternSeed: 0,
  typeface: DEFAULT_TYPEFACE,
};
