/**
 * "Pega un enlace, email o teléfono": guesses the kind of contact detail from
 * whatever was pasted. Pure and isomorphic; the kind's own rules still
 * validate the value afterwards (this only picks the kind).
 */
import { parseHttpUrl, type LinkKind } from "./links";

export interface DetectedLink {
  kind: LinkKind;
  /** The value to store (as typed, except where the kind needs another form: wa.me → +34…, mailto: → the address). */
  value: string;
}

const EMAIL_LIKE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_LIKE_RE = /^\+?[\d\s().-]+$/;
const MIN_PHONE_DIGITS = 6;

const HOST_KINDS: ReadonlyArray<{ hosts: readonly string[]; kind: LinkKind }> = [
  { hosts: ["linkedin.com"], kind: "linkedin" },
  { hosts: ["instagram.com"], kind: "instagram" },
  { hosts: ["x.com", "twitter.com"], kind: "x" },
  { hosts: ["github.com"], kind: "github" },
  { hosts: ["tiktok.com"], kind: "tiktok" },
  { hosts: ["youtube.com", "youtu.be"], kind: "youtube" },
  { hosts: ["t.me", "telegram.me"], kind: "telegram" },
  { hosts: ["calendly.com", "cal.com"], kind: "booking" },
];
const WHATSAPP_HOSTS = ["wa.me", "whatsapp.com"];
/** Click-to-chat links: wa.me/34600…, api.whatsapp.com/send?phone=34600… (and web.whatsapp.com/send). */
const CLICK_TO_CHAT_SEND_HOSTS = ["api.whatsapp.com", "web.whatsapp.com"];
const WA_ME_PATH_RE = /^\/\+?(\d{6,15})\/?$/;

function onHost(host: string, hosts: readonly string[]): boolean {
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/** "%" on its own (a half-typed escape) makes decodeURIComponent throw: keep the text as it is. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The number in a click-to-chat link, or "" for any other WhatsApp URL (group
 * invites on chat.whatsapp.com, wa.me/message/… short links, channels): those
 * carry codes, not phone numbers.
 */
function whatsappNumber(url: URL, host: string): string {
  if (host === "wa.me" || host === "www.wa.me") return url.pathname.match(WA_ME_PATH_RE)?.[1] ?? "";
  if (CLICK_TO_CHAT_SEND_HOSTS.includes(host) && /^\/send\/?$/.test(url.pathname)) {
    return (url.searchParams.get("phone") ?? "").replace(/\D/g, "");
  }
  return "";
}

/** The kind (and value) for a pasted detail, or null when it can't tell (e.g. "@usuario": Instagram? X?). */
export function detectLink(raw: string): DetectedLink | null {
  const input = raw.trim();
  if (!input) return null;

  const mailto = input.match(/^mailto:([^?]+)/i);
  if (mailto) return { kind: "email", value: safeDecode(mailto[1]!) };
  const tel = input.match(/^tel:(.+)$/i);
  if (tel) return { kind: "phone", value: tel[1]!.trim() };

  if (!input.startsWith("@") && !/^https?:/i.test(input) && EMAIL_LIKE_RE.test(input)) return { kind: "email", value: input };
  if (PHONE_LIKE_RE.test(input) && input.replace(/\D/g, "").length >= MIN_PHONE_DIGITS) return { kind: "phone", value: input };

  const url = parseHttpUrl(input);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (onHost(host, WHATSAPP_HOSTS)) {
    const digits = whatsappNumber(url, host);
    return digits.length >= MIN_PHONE_DIGITS ? { kind: "whatsapp", value: `+${digits}` } : { kind: "website", value: input };
  }
  const match = HOST_KINDS.find((rule) => onHost(host, rule.hosts));
  return { kind: match?.kind ?? "website", value: input };
}
