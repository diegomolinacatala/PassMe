import type { VisitSource } from "./env";

const DEFAULT_NEXT = "/dashboard";

/** Client IP as set by Vercel's edge (first X-Forwarded-For hop). */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|embedly|quora|pinterest|vkshare|w3c_validator|headless|lighthouse/i;

/** Link-preview fetchers and crawlers should not count as card views. */
export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT_RE.test(userAgent);
}

/** Only allow same-site relative redirects (blocks //evil.com and /\evil.com). */
export function safeNextPath(next: string | null | undefined, fallback = DEFAULT_NEXT): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001F]/.test(next)) return fallback;
  return next;
}

export function parseVisitSource(value: string | null | undefined): VisitSource {
  return value === "qr" || value === "share" ? value : "direct";
}
