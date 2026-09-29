import "server-only";
import sharp from "sharp";
import { appIconSvg, markSvg } from "@/lib/brand";
import { AVATAR_MAX_BYTES } from "@/lib/card/avatar";
import { log } from "@/lib/log";

/**
 * Wallet images rendered on demand with sharp and memoized per color.
 * Apple sizes (points): icon 29×29, logo ≤160×50 — plus @2x/@3x. The strip
 * artwork is rendered by ./art.tsx.
 */

type ImageSet = Record<string, Buffer>;

const ICON_SIZES = { "icon.png": 29, "icon@2x.png": 58, "icon@3x.png": 87 } as const;
const LOGO_SIZES = { "logo.png": 50, "logo@2x.png": 100, "logo@3x.png": 150 } as const;
const AVATAR_FETCH_TIMEOUT_MS = 5_000;
/**
 * Uploads are resized to 512 px in the browser, but the storage API accepts any
 * ≤ 2 MB image: cap the decoded size so a tiny file can't expand into gigabytes.
 */
export const AVATAR_MAX_INPUT_PIXELS = 4096 * 4096;
const AVATAR_FORMATS: ReadonlySet<string> = new Set(["jpeg", "png", "webp"]);
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
    renderSvgSizes(appIconSvg(), ICON_SIZES),
  );
}

/** Top-left logo drawn in the card's text color so it reads on any accent. */
export function logoImages(foregroundHex: string, backgroundHex: string): Promise<ImageSet> {
  return memo(`logo:${foregroundHex}:${backgroundHex}`, () =>
    renderSvgSizes(markSvg({ foreground: foregroundHex, cutout: backgroundHex }), LOGO_SIZES),
  );
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
    // Throws if it isn't an image or if it decodes to more than the pixel cap.
    const meta = await sharp(buffer, { limitInputPixels: AVATAR_MAX_INPUT_PIXELS }).metadata();
    if (!meta.width || !meta.height || meta.width * meta.height > AVATAR_MAX_INPUT_PIXELS) return null;
    // The bucket only checks the declared type: an SVG or TIFF sent as image/png stays out.
    if (!AVATAR_FORMATS.has(meta.format ?? "")) return null;
    return buffer;
  } catch (error) {
    log.warn("avatar fetch error", {}, error);
    return null;
  }
}

/** Small JPEG for embedding in a vCard PHOTO field. */
export async function avatarForVCard(avatar: Buffer): Promise<string> {
  const jpeg = await sharp(avatar, { limitInputPixels: AVATAR_MAX_INPUT_PIXELS })
    .rotate()
    .resize(256, 256, { fit: "cover" })
    .jpeg({ quality: 80 })
    .toBuffer();
  return jpeg.toString("base64");
}
