import "server-only";
import sharp from "sharp";
import { BRAND, markSvg } from "@/lib/brand";
import { AVATAR_MAX_BYTES } from "@/lib/card/avatar";
import { log } from "@/lib/log";

/**
 * Wallet images rendered on demand with sharp and memoized per color.
 * Apple sizes (points): icon 29×29, logo ≤160×50, thumbnail 90×90 — plus @2x/@3x.
 */

type ImageSet = Record<string, Buffer>;

const ICON_SIZES = { "icon.png": 29, "icon@2x.png": 58, "icon@3x.png": 87 } as const;
const LOGO_SIZES = { "logo.png": 50, "logo@2x.png": 100, "logo@3x.png": 150 } as const;
const THUMBNAIL_SIZES = { "thumbnail.png": 90, "thumbnail@2x.png": 180, "thumbnail@3x.png": 270 } as const;
const AVATAR_FETCH_TIMEOUT_MS = 5_000;
const MAX_CACHE_ENTRIES = 64;

const cache = new Map<string, Promise<ImageSet>>();

function memo(key: string, build: () => Promise<ImageSet>): Promise<ImageSet> {
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  const promise = build().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, promise);
  return promise;
}

async function renderSvgSizes(svg: string, sizes: Record<string, number>): Promise<ImageSet> {
  const entries = await Promise.all(
    Object.entries(sizes).map(async ([name, px]) => {
      const png = await sharp(Buffer.from(svg), { density: 300 }).resize(px, px).png().toBuffer();
      return [name, png] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** App icon shown on the lock screen / notifications. Always brand colors. */
export function brandIconImages(): Promise<ImageSet> {
  return memo("icon", () =>
    renderSvgSizes(markSvg({ foreground: BRAND.paper, cutout: BRAND.signal, background: BRAND.ink, padding: 6 }), ICON_SIZES),
  );
}

/** Top-left logo drawn in the card's text color so it reads on any accent. */
export function logoImages(foregroundHex: string, backgroundHex: string): Promise<ImageSet> {
  return memo(`logo:${foregroundHex}:${backgroundHex}`, () =>
    renderSvgSizes(markSvg({ foreground: foregroundHex, cutout: backgroundHex }), LOGO_SIZES),
  );
}

/** Circular avatar thumbnail (transparent corners). */
export async function thumbnailImages(avatar: Buffer): Promise<ImageSet> {
  const size = THUMBNAIL_SIZES["thumbnail@3x.png"];
  const square = await sharp(avatar).rotate().resize(size, size, { fit: "cover" }).png().toBuffer();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  const round = await sharp(square).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();

  const entries = await Promise.all(
    Object.entries(THUMBNAIL_SIZES).map(async ([name, px]) => {
      const png = px === size ? round : await sharp(round).resize(px, px).png().toBuffer();
      return [name, png] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Downloads an avatar from our own storage URL. Returns null (and logs) on any
 * failure so passes/vCards still work without a photo.
 */
export async function fetchAvatar(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      log.warn("avatar fetch failed", { status: response.status });
      return null;
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > AVATAR_MAX_BYTES) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > AVATAR_MAX_BYTES) return null;
    await sharp(buffer).metadata(); // throws if it isn't an image
    return buffer;
  } catch (error) {
    log.warn("avatar fetch error", {}, error);
    return null;
  }
}

/** Small JPEG for embedding in a vCard PHOTO field. */
export async function avatarForVCard(avatar: Buffer): Promise<string> {
  const jpeg = await sharp(avatar).rotate().resize(256, 256, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer();
  return jpeg.toString("base64");
}
