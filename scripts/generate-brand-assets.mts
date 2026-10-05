/**
 * Regenerates static brand assets from the mark in src/lib/brand.ts:
 *   src/app/icon.svg              favicon (modern browsers)
 *   src/app/favicon.ico           favicon (16/32/48 px, for everything else)
 *   src/app/apple-icon.png        iOS home-screen icon (180×180)
 *   public/brand/icon-192.png     web app manifest icons (src/app/manifest.ts)
 *   public/brand/icon-512.png
 *   public/brand/icon-maskable-512.png  Android adaptive icon: full-bleed Café, mark inside the safe zone
 *   public/brand/wallet-logo.png  Google Wallet default logo (660×660, Google crops it to a circle)
 *
 * Run: npm run brand   (Node ≥ 22.18 strips types natively)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { appIconSvg, BRAND, markSvg } from "../src/lib/brand.ts";
import { encodeIco } from "../src/lib/ico.ts";

const root = join(import.meta.dirname, "..");

const appIcon = appIconSvg();
writeFileSync(join(root, "src/app/icon.svg"), `${appIcon}\n`);

function renderPng(svg: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toBuffer();
}

await sharp(Buffer.from(appIcon), { density: 600 })
  .resize(180, 180)
  .flatten({ background: BRAND.ink })
  .png()
  .toFile(join(root, "src/app/apple-icon.png"));

// Manifest icons keep the rounded plate (transparent corners) for "any" contexts.
writeFileSync(join(root, "public/brand/icon-192.png"), await renderPng(appIcon, 192));
writeFileSync(join(root, "public/brand/icon-512.png"), await renderPng(appIcon, 512));

/** The mark on a full-bleed Café square, `padding` units (of 64) from each edge. */
function plateSvg(size: number, padding: number): string {
  const mark = markSvg({ foreground: BRAND.paper, cutout: BRAND.signal, echo: BRAND.signal, padding }).replace(/^<svg[^>]*>|<\/svg>$/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BRAND.ink}"/>${mark}</svg>`;
}

// Android masks adaptive icons to a circle or squircle: the mark stays within the central 80 %.
writeFileSync(join(root, "public/brand/icon-maskable-512.png"), await renderPng(plateSvg(512, 13), 512));

const favicon = encodeIco(
  await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await renderPng(appIcon, size) }))),
);
writeFileSync(join(root, "src/app/favicon.ico"), favicon);

// Google shows the logo inside a circle: keep the mark well inside the safe area.
await sharp(Buffer.from(plateSvg(660, 14)), { density: 600 }).resize(660, 660).png().toFile(join(root, "public/brand/wallet-logo.png"));

console.info("Brand assets written.");
