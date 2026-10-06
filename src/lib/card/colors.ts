/**
 * Color helpers shared by the web preview, the public page and both wallets.
 * Apple Wallet wants `rgb(r, g, b)` strings; Google Wallet wants `#rrggbb`.
 * Curated themes live in ./design.ts.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Theme "Naranja" — the background every new card starts with. */
export const DEFAULT_ACCENT = "#EF7A4A";

/** Brand "Café": the dark text color used on light cards. */
const INK: Rgb = { r: 34, g: 27, b: 23 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };
/** WCAG AA for body text. */
const TEXT_MIN_CONTRAST = 4.5;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

export function parseHex(hex: string): Rgb | null {
  if (!isHexColor(hex)) return null;
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function toRgbString({ r, g, b }: Rgb): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a: Rgb, b: Rgb, amountOfB: number): Rgb {
  const t = Math.min(1, Math.max(0, amountOfB));
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/** Picks ink or white — whichever reads better on the given background. */
/**
 * Picks white or Café ink — whichever reads better on the given background.
 * On the few mid-tones where warm ink can't reach AA, falls back to pure black
 * (white or black always clears 4.5:1).
 */
export function readableOn(background: Rgb): Rgb {
  const best = contrastRatio(background, WHITE) >= contrastRatio(background, INK) ? WHITE : INK;
  if (best === WHITE || contrastRatio(background, INK) >= TEXT_MIN_CONTRAST) return best;
  return contrastRatio(background, BLACK) >= contrastRatio(background, WHITE) ? BLACK : WHITE;
}

export interface CardPalette {
  background: Rgb;
  foreground: Rgb;
  /** Field labels: the detail color when it reads well, otherwise a softened foreground. */
  label: Rgb;
  /** Color of the motif, the photo frame and other printed details. */
  detail: Rgb;
  isDark: boolean;
}

/** Small label text must stay ≥ 4.5:1 (WCAG AA); soften it only as far as that allows. */
const LABEL_MIN_CONTRAST = 4.5;
const LABEL_MAX_SOFTENING = 0.4;

function softLabel(foreground: Rgb, background: Rgb): Rgb {
  for (let t = LABEL_MAX_SOFTENING; t > 0; t -= 0.05) {
    const candidate = mix(foreground, background, t);
    if (contrastRatio(candidate, background) >= LABEL_MIN_CONTRAST) return candidate;
  }
  return foreground;
}

/** Details must stand out from the background at least this much (WCAG non-text contrast). */
const DETAIL_MIN_CONTRAST = 1.6;

/**
 * Tonal detail color derived from the background: a lighter, cleaner version
 * on dark cards and a deeper one on light cards. Used when the owner picks
 * "automático".
 */
export function autoDetail(background: Rgb): Rgb {
  const isDark = readableOn(background) === WHITE;
  for (let t = 0.5; t <= 0.95; t += 0.05) {
    const candidate = isDark ? mix(background, WHITE, t) : mix(background, INK, t);
    if (contrastRatio(candidate, background) >= 3) return candidate;
  }
  return readableOn(background);
}

export function cardPalette(accentHex: string, detailHex?: string | null): CardPalette {
  const background = parseHex(accentHex) ?? parseHex(DEFAULT_ACCENT)!;
  const foreground = readableOn(background);
  const isDark = foreground === WHITE;
  const chosen = detailHex ? parseHex(detailHex) : null;
  const detail = chosen && contrastRatio(chosen, background) >= DETAIL_MIN_CONTRAST ? chosen : autoDetail(background);
  return {
    background,
    foreground,
    label: contrastRatio(detail, background) >= LABEL_MIN_CONTRAST ? detail : softLabel(foreground, background),
    detail,
    isDark,
  };
}

/** CSS custom properties consumed by card components. */
export function cardCssVars(accentHex: string, detailHex?: string | null): Record<string, string> {
  const p = cardPalette(accentHex, detailHex);
  return {
    "--card-bg": toHex(p.background),
    "--card-fg": toHex(p.foreground),
    "--card-label": toHex(p.label),
    "--card-detail": toHex(p.detail),
  };
}

/**
 * A color typed or pasted by hand ("#1f3a5f", "1F3A5F", "#abc") as "#RRGGBB",
 * or null while it isn't one yet.
 */
export function parseHexInput(raw: string): string | null {
  const text = raw.trim().replace(/^#/, "");
  const full = /^[0-9a-f]{3}$/i.test(text) ? text.replace(/./g, (c) => c + c) : text;
  return /^[0-9a-f]{6}$/i.test(full) ? `#${full.toUpperCase()}` : null;
}
