import type { VisitSource } from "./env";

const DEFAULT_NEXT = "/dashboard";

/**
 * Client IP as set by Vercel's edge. `x-vercel-forwarded-for` can't be forged
 * by the client; the others are fallbacks for local runs and other hosts.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** The four octets of a dotted IPv4 address as two 16-bit hex groups, or null if it isn't one. */
function ipv4AsGroups(dotted: string): [string, string] | null {
  const octets = dotted.split(".");
  if (octets.length !== 4 || !octets.every((o) => /^[0-9]{1,3}$/.test(o) && Number(o) <= 255)) return null;
  const [a, b, c, d] = octets.map(Number) as [number, number, number, number];
  return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
}

/** Expands an IPv6 address to its 8 groups (a dotted IPv4 tail counts as two), or returns null if it isn't one. */
function ipv6Groups(ip: string): string[] | null {
  if (!ip.includes(":") || !/^[0-9a-f:.]+$/i.test(ip)) return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const last = (tail.length > 0 ? tail : head).at(-1);
  if (last?.includes(".")) {
    const groups = ipv4AsGroups(last);
    if (!groups) return null;
    (tail.length > 0 ? tail : head).splice(-1, 1, ...groups);
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  return [...head, ...Array<string>(missing).fill("0"), ...tail];
}

/** "::ffff:203.0.113.7" is the IPv4 client 203.0.113.7 reached through a dual-stack socket. */
function mappedIpv4(groups: string[]): string | null {
  const value = groups.map((g) => Number.parseInt(g, 16));
  if (value.some((v) => Number.isNaN(v))) return null;
  if (!value.slice(0, 5).every((v) => v === 0) || value[5] !== 0xffff) return null;
  const hi = value[6]!;
  const lo = value[7]!;
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
}

/**
 * Key for per-client rate limits. IPv6 users typically own a whole /64, so
 * they are bucketed by that prefix (otherwise rotating addresses would dodge
 * every limit). IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are the IPv4
 * client in disguise: they get the key of the plain IPv4, not a shared /64.
 */
export function clientRateKey(headers: Headers): string {
  const ip = getClientIp(headers);
  const groups = ipv6Groups(ip);
  if (!groups) return ip;
  return mappedIpv4(groups) ?? `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
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

/**
 * Reads a request body as text, giving up (null) past `maxBytes` — also for
 * chunked bodies that don't declare a Content-Length.
 */
export async function readTextLimited(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
