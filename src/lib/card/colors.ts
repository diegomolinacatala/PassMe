/**
 * Color helpers shared by the web preview, the public page and both wallets.
 * Apple Wallet wants `rgb(r, g, b)` strings; Google Wallet wants `#rrggbb`.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_ACCENT = "#141414";

/** Curated card colors. Hand-picked so both black and white text stay legible. */
export const ACCENT_SWATCHES: ReadonlyArray<{ name: string; hex: string }> = [
  { name: "Tinta", hex: "#141414" },
  { name: "Bermellón", hex: "#FF4A1C" },
  { name: "Cobalto", hex: "#2340F5" },
  { name: "Bosque", hex: "#1F4D3A" },
  { name: "Ciruela", hex: "#5B2A86" },
  { name: "Arena", hex: "#E9DFCB" },
  { name: "Salvia", hex: "#B7C9A8" },
  { name: "Cielo", hex: "#A9CBF2" },
  { name: "Rosa", hex: "#F4B6C2" },
  { name: "Limón", hex: "#E8F260" },
];

const INK: Rgb = { r: 17, g: 17, b: 17 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

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
export function readableOn(background: Rgb): Rgb {
  return contrastRatio(background, WHITE) >= contrastRatio(background, INK) ? WHITE : INK;
}

export interface CardPalette {
  background: Rgb;
  foreground: Rgb;
  /** Softer tone for field labels. */
  label: Rgb;
  isDark: boolean;
}

export function cardPalette(accentHex: string): CardPalette {
  const background = parseHex(accentHex) ?? parseHex(DEFAULT_ACCENT)!;
  const foreground = readableOn(background);
  const isDark = foreground === WHITE;
  return {
    background,
    foreground,
    label: mix(foreground, background, 0.38),
    isDark,
  };
}

/** CSS custom properties consumed by card components. */
export function cardCssVars(accentHex: string): Record<string, string> {
  const p = cardPalette(accentHex);
  return {
    "--card-bg": toHex(p.background),
    "--card-fg": toHex(p.foreground),
    "--card-label": toHex(p.label),
  };
}
