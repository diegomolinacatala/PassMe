/**
 * Public (browser-safe) configuration. Every value here may end up in the
 * client bundle, so never read secrets in this file — see config.server.ts.
 *
 * NEXT_PUBLIC_* variables are inlined at build time only when referenced
 * literally (process.env.NEXT_PUBLIC_X), which is why they are spelled out.
 */

const LOCAL_SITE_URL = "http://localhost:3000";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Canonical origin used in QR codes, wallet passes and emails. */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return trimTrailingSlash(explicit);

  const vercel =
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${trimTrailingSlash(vercel)}`;

  return LOCAL_SITE_URL;
}

export interface SupabasePublicConfig {
  url: string;
  key: string;
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase's new "publishable" key replaces the legacy "anon" key; accept both.
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: trimTrailingSlash(url), key };
}

/** False → the app runs in demo mode (sample card, no login, nothing persisted). */
export function isSupabaseConfigured(): boolean {
  return getSupabasePublicConfig() !== null;
}

export function isGoogleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
}

/**
 * Cloudflare Turnstile site key. When set, the login and contact forms show the
 * widget; enable the same provider in Supabase (Auth → Attack Protection).
 */
export function getTurnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
}

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export const AVATAR_BUCKET = "avatars";

export function avatarPublicUrl(path: string | null | undefined): string | null {
  const config = getSupabasePublicConfig();
  if (!path || !config) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${config.url}/storage/v1/object/public/${AVATAR_BUCKET}/${encoded}`;
}

export type VisitSource = "direct" | "qr" | "share";

/** Public card URL. `source: "qr"` is what wallet passes encode, to count scans. */
export function profileUrl(slug: string, source?: Exclude<VisitSource, "direct">): string {
  const url = `${getSiteUrl()}/u/${encodeURIComponent(slug)}`;
  return source ? `${url}?src=${source}` : url;
}

/** "passme.app/u/alex" — for captions under QR codes. */
export function prettyProfileUrl(slug: string): string {
  return profileUrl(slug).replace(/^https?:\/\//, "");
}
