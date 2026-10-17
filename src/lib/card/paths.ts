import type { VisitSource } from "@/lib/env";
import { DEMO_SLUG } from "./demo-slug";
import { checkSlug } from "./slug";

/**
 * Links between a card and /crear, and the query values they carry. No zod and
 * almost no imports, so the public card's client code can use them.
 */

/** Slug of the card that led someone to /crear (?de=…), or null when missing or malformed. */
export function parseFromSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return slug === DEMO_SLUG || checkSlug(slug).ok ? slug : null;
}

/**
 * How the newcomer reached that card (?via=…): scanned in person ("qr"), sent a
 * link ("share") or anything else ("direct"). The welcome adapts to it.
 */
export function parseVia(value: unknown): VisitSource {
  return value === "qr" || value === "share" ? value : "direct";
}

/** "&via=qr" — only when it says something (and only alongside a card). */
function viaParam(from: string | null, via: VisitSource): string {
  return from && via !== "direct" ? `&via=${via}` : "";
}

/** "Crear mi tarjeta" link, remembering whose card it came from and how they got there. */
export function createPath(from: string | null, via: VisitSource = "direct"): string {
  return from ? `/crear?de=${encodeURIComponent(from)}${viaParam(from, via)}` : "/crear";
}

/** Where a brand-new card lands: the editor's welcome, still remembering whose card led here. */
export function welcomePath(from: string | null, via: VisitSource = "direct"): string {
  return `/dashboard?nueva=1${from ? `&de=${encodeURIComponent(from)}` : ""}${viaParam(from, via)}`;
}
