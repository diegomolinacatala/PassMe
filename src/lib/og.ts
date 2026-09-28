import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Fonts for next/og (Satori needs .woff/.ttf, not woff2). Files live in /assets/fonts (OFL). */
interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 500;
  style: "normal" | "italic";
}

const FONT_FILES: ReadonlyArray<Omit<OgFont, "data"> & { file: string }> = [
  { name: "Instrument Serif", file: "instrument-serif-latin-400-normal.woff", weight: 400, style: "normal" },
  { name: "Instrument Serif", file: "instrument-serif-latin-400-italic.woff", weight: 400, style: "italic" },
  { name: "Instrument Serif Ext", file: "instrument-serif-latin-ext-400-normal.woff", weight: 400, style: "normal" },
  { name: "Geist", file: "geist-latin-400-normal.woff", weight: 400, style: "normal" },
  { name: "Geist", file: "geist-latin-500-normal.woff", weight: 500, style: "normal" },
  { name: "Geist Mono", file: "geist-mono-latin-500-normal.woff", weight: 500, style: "normal" },
];

let fontsPromise: Promise<OgFont[]> | null = null;

async function readFonts(): Promise<OgFont[]> {
  const dir = join(process.cwd(), "assets", "fonts");
  return Promise.all(
    FONT_FILES.map(async ({ file, ...font }) => ({ ...font, data: await readFile(join(dir, file)) })),
  );
}

export function loadOgFonts(): Promise<OgFont[]> {
  if (!fontsPromise) {
    fontsPromise = readFonts().catch((error: unknown) => {
      fontsPromise = null;
      throw error;
    });
  }
  return fontsPromise;
}

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const SERIF = '"Instrument Serif", "Instrument Serif Ext"';
// Only Geist's latin subset ships in assets/fonts: names with other letters (ł, š…) borrow
// them from the serif's latin-ext file rather than rendering as empty boxes.
export const OG_SANS = '"Geist", "Instrument Serif Ext"';
export const OG_MONO = '"Geist Mono"';
