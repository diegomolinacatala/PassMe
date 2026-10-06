/**
 * Public card handles: passme.app/u/<slug>.
 * Keep SLUG_RE and RESERVED_SLUGS in sync with the check constraint in
 * supabase/migrations (profiles_slug_format / profiles_slug_not_reserved).
 */

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 32;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "account",
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "billing",
  "blog",
  "dashboard",
  "demo",
  "docs",
  "help",
  "login",
  "logout",
  "me",
  "null",
  "pass",
  "passes",
  "passme",
  "pricing",
  "privacy",
  "profile",
  "root",
  "settings",
  "signup",
  "static",
  "status",
  "support",
  "terms",
  "undefined",
  "wallet",
  "www",
]);

export type SlugCheck = { ok: true } | { ok: false; reason: "length" | "format" | "reserved" };

export function checkSlug(slug: string): SlugCheck {
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return { ok: false, reason: "length" };
  }
  if (!SLUG_RE.test(slug)) return { ok: false, reason: "format" };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: "reserved" };
  return { ok: true };
}

export const SLUG_ERRORS: Record<Exclude<SlugCheck, { ok: true }>["reason"], string> = {
  length: `Entre ${SLUG_MIN_LENGTH} y ${SLUG_MAX_LENGTH} caracteres.`,
  format: "Solo minúsculas, números y guiones (sin guiones al principio o al final).",
  reserved: "Ese nombre está reservado.",
};

/** Turns any text ("José Núñez", "ana.b@x.com") into a slug-safe base. */
export function slugify(input: string, maxLength = 24): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/** Base of the handle new cards get until the owner picks one ("tarjeta-3f9a1c"). */
export const PLACEHOLDER_SLUG_BASE = "tarjeta";
const PLACEHOLDER_SLUG_RE = /^tarjeta-[0-9a-f]{6}$/;

export function isPlaceholderSlug(slug: string): boolean {
  return PLACEHOLDER_SLUG_RE.test(slug);
}

/** Handle suggested from the owner's name ("José Núñez" → "jose-nunez"), or null if unusable. */
export function suggestSlug(fullName: string): string | null {
  const base = slugify(fullName, SLUG_MAX_LENGTH);
  return checkSlug(base).ok ? base : null;
}

/** Builds a candidate slug from a seed (name or email local-part) plus a random suffix. */
export function slugCandidate(seed: string, suffix: string): string {
  const base = slugify(seed.split("@")[0] ?? "") || "tarjeta";
  const padded = base.length < SLUG_MIN_LENGTH ? `${base}-card` : base;
  return `${padded}-${suffix}`.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, "");
}

/**
 * What the slug field keeps while typing: lowercase, no accents ("José" → "jose"),
 * and "_", "." or spaces become "-" ("pablo_serrano" → "pablo-serrano").
 * Leading/trailing hyphens are left for the validation message (the person may still be typing).
 */
export function normalizeSlugInput(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, SLUG_MAX_LENGTH);
}

function withSuffix(base: string, suffix: string): string {
  return `${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

/**
 * Candidates to offer when a slug is taken, best first ("pablo-serrano" →
 * "pablo-serrano-2", "pabloserrano", "pablo-serrano-3"…). Only valid ones,
 * never the taken slug itself; availability is checked by the caller.
 */
export function slugAlternatives(taken: string): string[] {
  const base = taken.replace(/-\d+$/, "") || taken;
  const candidates = [withSuffix(base, "-2"), base.replace(/-/g, ""), withSuffix(base, "-3"), withSuffix(base, "-4"), withSuffix(base, "-5")];
  return [...new Set(candidates)].filter((candidate) => candidate !== taken && checkSlug(candidate).ok);
}
