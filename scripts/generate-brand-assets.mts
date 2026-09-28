/**
 * Regenerates static brand assets from the mark in src/lib/brand.ts:
 *   src/app/icon.svg            favicon
 *   src/app/apple-icon.png      iOS home-screen icon (180×180)
 *   public/brand/wallet-logo.png  Google Wallet default logo (660×660, Google crops it to a circle)
 *
 * Run: node scripts/generate-brand-assets.mts   (Node ≥ 22.18 strips types natively)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { appIconSvg, BRAND, markSvg } from "../src/lib/brand.ts";

const root = join(import.meta.dirname, "..");

const appIcon = appIconSvg();
writeFileSync(join(root, "src/app/icon.svg"), `${appIcon}\n`);

await sharp(Buffer.from(appIcon), { density: 600 })
  .resize(180, 180)
  .flatten({ background: BRAND.ink })
  .png()
  .toFile(join(root, "src/app/apple-icon.png"));

// Google shows the logo inside a circle: keep the mark well inside the safe area.
const walletLogo = `<svg xmlns="http://www.w3.org/2000/svg" width="660" height="660" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BRAND.ink}"/>${markSvg({ foreground: BRAND.paper, cutout: BRAND.signal, echo: BRAND.signal, padding: 14 }).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`;
await sharp(Buffer.from(walletLogo), { density: 600 }).resize(660, 660).png().toFile(join(root, "public/brand/wallet-logo.png"));

console.info("Brand assets written.");
