import "server-only";
import { createHash } from "node:crypto";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { initials } from "@/components/card/avatar";
import { HERO_BOX, PassArt, STRIP_BOX, type ArtVariant } from "@/components/card/pass-art";
import { designVersion, resolveDesign } from "@/lib/card/design";
import type { PublicCard } from "@/lib/card/types";
import { loadOgFonts, OG_SANS, SERIF } from "@/lib/og";

/**
 * Server-side twin of <PassArt>: renders the artwork to PNG with Satori so the
 * wallets show exactly what the editor previewed.
 *
 *   Apple store-card strip  375×144 pt  → strip.png / @2x / @3x
 *   Google hero image       1032×336 px → served by /u/[slug]/hero
 */

type ImageSet = Record<string, Buffer>;

const STRIP_SCALES = { "strip.png": 1, "strip@2x.png": 2, "strip@3x.png": 3 } as const;
const HERO_WIDTH = 1032;
const HERO_HEIGHT = 336;
const AVATAR_PX = 240;
const MAX_CACHE_ENTRIES = 48;

const cache = new Map<string, Promise<Buffer>>();

/** Small LRU: a hit moves the entry to the end, eviction takes the front. */
function memo(key: string, build: () => Promise<Buffer>): Promise<Buffer> {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  const promise = build().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, promise);
  return promise;
}

/** Everything the artwork depends on; changes to anything else don't re-render it. */
export function artVersion(card: PublicCard, variant: ArtVariant): string {
  const design = resolveDesign(card);
  // The hero has no text, except the monogram's initial.
  const hasText = variant === "strip" || design.pattern === "monograma";
  return designVersion([
    variant,
    design.background,
    design.detail,
    design.pattern,
    design.seed,
    hasText ? design.typeface : "",
    hasText ? card.fullName : "",
    variant === "strip" ? card.avatarUrl : "",
  ]);
}

async function avatarDataUri(avatar: Buffer): Promise<string> {
  const jpeg = await sharp(avatar).rotate().resize(AVATAR_PX, AVATAR_PX, { fit: "cover" }).jpeg({ quality: 86 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

async function renderPng(card: PublicCard, variant: ArtVariant, width: number, height: number, avatar: Buffer | null) {
  const box = variant === "strip" ? STRIP_BOX : HERO_BOX;
  const scale = width / box.width;
  const [fonts, avatarSrc] = await Promise.all([loadOgFonts(), avatar ? avatarDataUri(avatar) : Promise.resolve(null)]);
  const response = new ImageResponse(
    (
      <PassArt
        design={resolveDesign(card)}
        variant={variant}
        name={card.fullName}
        initials={initials(card.fullName)}
        avatarSrc={avatarSrc}
        unit={(points) => points * scale}
        fonts={{ serif: SERIF, sans: OG_SANS }}
        pixelSize={{ width, height }}
      />
    ),
    { width, height, fonts },
  );
  return Buffer.from(await response.arrayBuffer());
}

/** Apple Wallet strip images at 1x/2x/3x (rendered once at 3x, then downscaled). */
export async function stripImages(card: PublicCard, avatar: Buffer | null): Promise<ImageSet> {
  const avatarKey = avatar ? createHash("sha1").update(avatar).digest("hex") : "none";
  const width = STRIP_BOX.width * 3;
  const height = STRIP_BOX.height * 3;
  const master = await memo(`strip:${artVersion(card, "strip")}:${avatarKey}`, () =>
    renderPng(card, "strip", width, height, avatar),
  );

  const entries = await Promise.all(
    Object.entries(STRIP_SCALES).map(async ([name, factor]) => {
      const png =
        factor === 3
          ? master
          : await sharp(master)
              .resize(STRIP_BOX.width * factor, STRIP_BOX.height * factor)
              .png()
              .toBuffer();
      return [name, png] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Google Wallet hero image (no text, per Google's brand guidelines). */
export function heroImage(card: PublicCard): Promise<Buffer> {
  return memo(`hero:${artVersion(card, "hero")}`, () => renderPng(card, "hero", HERO_WIDTH, HERO_HEIGHT, null));
}
