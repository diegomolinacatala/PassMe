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
 * ≤ 2 MB image: cap the decoded size so a tiny file can't expand into hundreds
 * of megabytes. 1536² leaves room for photos saved before the 1024 px rule.
 */
export const AVATAR_MAX_INPUT_PIXELS = 1536 * 1536;
/** Longest side accepted for a newly saved photo (the editor sends 512 px). */
export const AVATAR_MAX_SIDE = 1024;
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

/** Who an avatar download is for: only used to make the log lines useful. */
export interface AvatarLogContext {
  slug?: string;
  profileId?: string;
}

/**
 * Why a photo can't be used for good (retrying changes nothing):
 *  - too_large: more bytes or pixels than we accept
 *  - format:    decodes, but isn't JPEG/PNG/WebP (SVG or TIFF sent as image/png)
 *  - undecodable: not an image at all / corrupt
 *  - missing:   the storage answered 4xx (file gone, or never uploaded)
 */
export type AvatarInvalidReason = "too_large" | "format" | "undecodable" | "missing";

export type AvatarResult =
  /** The card has no photo. */
  | { status: "none" }
  | { status: "ok"; buffer: Buffer; width: number; height: number; format: string }
  /** Permanent: serve the card without a photo. */
  | { status: "invalid"; reason: AvatarInvalidReason }
  /** Network error, timeout or a 5xx/429 from storage: retrying later may work. */
  | { status: "transient"; reason: string };

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 4xx other than these means "the file isn't there / isn't ours to read": permanent. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function inspect(buffer: Buffer, context: AvatarLogContext): Promise<AvatarResult> {
  try {
    // Throws if it isn't an image or if it decodes to more than the pixel cap.
    const meta = await sharp(buffer, { limitInputPixels: AVATAR_MAX_INPUT_PIXELS }).metadata();
    if (!meta.width || !meta.height) return { status: "invalid", reason: "undecodable" };
    if (meta.width * meta.height > AVATAR_MAX_INPUT_PIXELS) return { status: "invalid", reason: "too_large" };
    // The bucket only checks the declared type: an SVG or TIFF sent as image/png stays out.
    if (!AVATAR_FORMATS.has(meta.format ?? "")) return { status: "invalid", reason: "format" };
    return { status: "ok", buffer, width: meta.width, height: meta.height, format: meta.format! };
  } catch (error) {
    const reason: AvatarInvalidReason = /pixel limit/i.test(describeFailure(error)) ? "too_large" : "undecodable";
    log.warn("avatar rejected", { ...context, reason }, error);
    return { status: "invalid", reason };
  }
}

/**
 * Downloads an avatar from our own storage URL and tells permanent problems
 * (serve without a photo) apart from transient ones (try again): a pass built
 * during a storage hiccup would otherwise stay photo-less until the next edit.
 */
export async function fetchAvatarResult(url: string | null, context: AvatarLogContext = {}): Promise<AvatarResult> {
  if (!url) return { status: "none" };

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS) });
  } catch (error) {
    log.warn("avatar fetch error", { ...context, transient: true }, error);
    return { status: "transient", reason: describeFailure(error) };
  }

  if (!response.ok) {
    const transient = isTransientStatus(response.status);
    log.warn("avatar fetch failed", { ...context, status: response.status, transient });
    return transient ? { status: "transient", reason: `http ${response.status}` } : { status: "invalid", reason: "missing" };
  }

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > AVATAR_MAX_BYTES) return { status: "invalid", reason: "too_large" };

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    log.warn("avatar download interrupted", { ...context, transient: true }, error);
    return { status: "transient", reason: describeFailure(error) };
  }
  if (buffer.byteLength > AVATAR_MAX_BYTES) return { status: "invalid", reason: "too_large" };
  return inspect(buffer, context);
}

/**
 * Same download for callers that simply serve the card without a photo when
 * anything goes wrong (vCard, link preview). Passes use `fetchAvatarResult`.
 */
export async function fetchAvatar(url: string | null, context: AvatarLogContext = {}): Promise<Buffer | null> {
  const result = await fetchAvatarResult(url, context);
  return result.status === "ok" ? result.buffer : null;
}

export type UploadedAvatarVerdict =
  | { verdict: "ok" }
  /** Spanish message for the editor. */
  | { verdict: "rejected"; error: string }
  /** Couldn't be checked now (storage unreachable, file not visible yet): don't block the save. */
  | { verdict: "unverified" };

export const AVATAR_TOO_BIG_ERROR = "La foto es demasiado grande. Elige otra.";
export const AVATAR_NOT_A_PHOTO_ERROR = "Ese archivo no es una foto válida. Elige otra.";

/**
 * Checks a photo the owner just uploaded before the card starts pointing at it:
 * JPEG/PNG/WebP, at most 1024 px on a side. The editor already sends 512 px, so
 * anything bigger comes from a client that skipped our uploader.
 */
export async function checkUploadedAvatar(url: string | null, context: AvatarLogContext = {}): Promise<UploadedAvatarVerdict> {
  const result = await fetchAvatarResult(url, context);
  switch (result.status) {
    case "none":
      return { verdict: "ok" };
    case "ok":
      return Math.max(result.width, result.height) > AVATAR_MAX_SIDE
        ? { verdict: "rejected", error: AVATAR_TOO_BIG_ERROR }
        : { verdict: "ok" };
    case "invalid":
      if (result.reason === "too_large") return { verdict: "rejected", error: AVATAR_TOO_BIG_ERROR };
      if (result.reason === "missing") return { verdict: "unverified" };
      return { verdict: "rejected", error: AVATAR_NOT_A_PHOTO_ERROR };
    case "transient":
      return { verdict: "unverified" };
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
