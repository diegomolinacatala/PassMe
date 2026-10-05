/**
 * Registry of every contact/link type a card can hold.
 *
 * Each kind knows how to validate + normalize raw user input, how to build a
 * safe href (never `javascript:` or `data:`), and how to display itself.
 * The same functions run in the browser (live validation) and on the server
 * (authoritative validation before saving), so keep this module isomorphic.
 */

export const LINK_KINDS = [
  "email",
  "phone",
  "whatsapp",
  "linkedin",
  "website",
  "instagram",
  "x",
  "github",
  "tiktok",
  "youtube",
  "telegram",
  "booking",
  "custom",
] as const;

export type LinkKind = (typeof LINK_KINDS)[number];

export type NormalizeResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export type LinkGroup = "contact" | "social" | "web";

export interface LinkKindDef {
  kind: LinkKind;
  /** Human label (Spanish UI). */
  label: string;
  group: LinkGroup;
  placeholder: string;
  inputMode: "email" | "tel" | "url" | "text";
  normalize(raw: string): NormalizeResult;
  href(value: string): string;
  display(value: string): string;
}

const MAX_VALUE_LENGTH = 300;
const EMAIL_MAX_LENGTH = 254;
const PHONE_MIN_DIGITS = 6;
const PHONE_MAX_DIGITS = 15;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;
const PHONE_ALLOWED_RE = /^\+?[0-9\s().-]+$/;

const ok = (value: string): NormalizeResult => ({ ok: true, value });
const fail = (error: string): NormalizeResult => ({ ok: false, error });

function clean(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Parses user input as an http(s) URL, adding https:// when no scheme is given. */
export function parseHttpUrl(raw: string): URL | null {
  const input = raw.trim();
  if (!input || input.length > MAX_VALUE_LENGTH || /\s/.test(input)) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(input);
  if (hasScheme && !/^https?:\/\//i.test(input)) return null;

  let url: URL;
  try {
    url = new URL(hasScheme ? input : `https://${input}`);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) return null;
  return url;
}

function urlToValue(url: URL): string {
  const value = url.toString();
  return url.pathname === "/" && !url.search && !url.hash ? value.replace(/\/$/, "") : value;
}

function prettyUrl(value: string): string {
  const stripped = value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  return stripped.length > 48 ? `${stripped.slice(0, 47)}…` : stripped;
}

function hostMatches(url: URL, hosts: readonly string[]): boolean {
  const host = url.hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

interface HandleRule {
  hosts: readonly string[];
  handle: RegExp;
  /** Extracts the handle from a URL pathname; first capture group is the handle. */
  path: RegExp;
  name: string;
}

/** Accepts `@handle`, `handle` or a full profile URL on one of the allowed hosts. */
function normalizeHandle(raw: string, rule: HandleRule): NormalizeResult {
  const input = raw.trim();
  if (!input) return fail(`Introduce tu usuario de ${rule.name}.`);

  const bareHost = input.toLowerCase().replace(/^www\./, "");
  if (rule.hosts.includes(bareHost)) return fail(`Añade tu usuario de ${rule.name}, no solo la web.`);

  if (input.includes("/") || /^https?:/i.test(input)) {
    const url = parseHttpUrl(input);
    if (!url || !hostMatches(url, rule.hosts)) {
      return fail(`Ese enlace no parece de ${rule.name}.`);
    }
    const match = url.pathname.match(rule.path);
    if (!match || !rule.handle.test(match[1])) {
      return fail(`No encuentro el usuario de ${rule.name} en ese enlace.`);
    }
    return ok(match[1]);
  }

  const handle = input.replace(/^@/, "");
  if (!rule.handle.test(handle)) return fail(`Usuario de ${rule.name} no válido.`);
  return ok(handle);
}

function normalizeEmail(raw: string): NormalizeResult {
  const value = raw.trim().toLowerCase();
  if (!value) return fail("Introduce un email.");
  if (value.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(value)) return fail("Email no válido.");
  return ok(value);
}

/**
 * `mailto:` with URI-significant characters escaped: an address like
 * `x?bcc=someone@evil.test` must stay one address, not become a Bcc header.
 */
function mailtoHref(email: string): string {
  return `mailto:${email.replace(/[%?&=#/"<>\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)}`;
}

function normalizePhone(raw: string, requireInternational: boolean): NormalizeResult {
  const value = clean(raw).replace(/^00/, "+");
  if (!value) return fail("Introduce un número.");
  if (!PHONE_ALLOWED_RE.test(value)) return fail("Solo números, espacios y el prefijo +.");
  const digits = digitsOnly(value);
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) {
    return fail("Número de teléfono no válido.");
  }
  if (requireInternational && !value.startsWith("+")) {
    return fail("Incluye el prefijo internacional (ej. +34).");
  }
  return ok(value);
}

function normalizeUrl(raw: string): NormalizeResult {
  if (!raw.trim()) return fail("Introduce un enlace.");
  const url = parseHttpUrl(raw);
  return url ? ok(urlToValue(url)) : fail("Enlace no válido (usa https://…).");
}

const LINKEDIN_HOSTS = ["linkedin.com"] as const;
const LINKEDIN_PATH_RE = /^\/(in|company|school|pub)\/([^/?#]{2,100})\/?$/i;
const LINKEDIN_HANDLE_RE = /^[\p{L}\p{N}_%-]{2,100}$/u;

function normalizeLinkedIn(raw: string): NormalizeResult {
  const input = raw.trim();
  if (!input) return fail("Introduce tu perfil de LinkedIn.");

  if (!/linkedin\./i.test(input)) {
    const handle = input.replace(/^@/, "").replace(/^in\//i, "");
    if (!LINKEDIN_HANDLE_RE.test(handle)) return fail("Usuario de LinkedIn no válido.");
    return ok(`https://www.linkedin.com/in/${handle}`);
  }

  const url = parseHttpUrl(input);
  if (!url || !hostMatches(url, LINKEDIN_HOSTS)) return fail("Ese enlace no parece de LinkedIn.");
  const match = url.pathname.match(LINKEDIN_PATH_RE);
  if (!match) return fail("Usa el enlace de tu perfil (linkedin.com/in/…).");
  const [, section, rawHandle] = match;
  let handle: string;
  try {
    handle = decodeURIComponent(rawHandle);
  } catch {
    return fail("Enlace de LinkedIn no válido.");
  }
  if (!LINKEDIN_HANDLE_RE.test(handle)) return fail("Enlace de LinkedIn no válido.");
  return ok(`https://www.linkedin.com/${section.toLowerCase()}/${encodeURIComponent(handle)}`);
}

function normalizeYouTube(raw: string): NormalizeResult {
  const input = raw.trim();
  if (!input) return fail("Introduce tu canal de YouTube.");
  if (/^@?[A-Za-z0-9._-]{3,30}$/.test(input) && !/youtube|youtu\.be/i.test(input)) {
    return ok(`https://www.youtube.com/@${input.replace(/^@/, "")}`);
  }
  const url = parseHttpUrl(input);
  if (!url || !hostMatches(url, ["youtube.com", "youtu.be"])) {
    return fail("Ese enlace no parece de YouTube.");
  }
  return ok(urlToValue(url));
}

function socialHref(base: string) {
  return (handle: string) => `${base}${encodeURIComponent(handle)}`;
}

const INSTAGRAM: HandleRule = {
  name: "Instagram",
  hosts: ["instagram.com"],
  handle: /^[A-Za-z0-9._]{1,30}$/,
  path: /^\/([^/]+)\/?$/,
};
const X_RULE: HandleRule = {
  name: "X",
  hosts: ["x.com", "twitter.com"],
  handle: /^[A-Za-z0-9_]{1,15}$/,
  path: /^\/([^/]+)\/?$/,
};
const GITHUB: HandleRule = {
  name: "GitHub",
  hosts: ["github.com"],
  handle: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/,
  path: /^\/([^/]+)\/?$/,
};
const TIKTOK: HandleRule = {
  name: "TikTok",
  hosts: ["tiktok.com"],
  handle: /^[A-Za-z0-9._]{2,24}$/,
  path: /^\/@([^/]+)\/?$/,
};
const TELEGRAM: HandleRule = {
  name: "Telegram",
  hosts: ["t.me", "telegram.me"],
  handle: /^[A-Za-z0-9_]{5,32}$/,
  path: /^\/([^/]+)\/?$/,
};

const DEFS: Record<LinkKind, LinkKindDef> = {
  email: {
    kind: "email",
    label: "Email",
    group: "contact",
    placeholder: "tu@empresa.com",
    inputMode: "email",
    normalize: normalizeEmail,
    href: mailtoHref,
    display: (v) => v,
  },
  phone: {
    kind: "phone",
    label: "Teléfono",
    group: "contact",
    placeholder: "+34 600 000 000",
    inputMode: "tel",
    normalize: (raw) => normalizePhone(raw, false),
    href: (v) => `tel:${v.startsWith("+") ? "+" : ""}${digitsOnly(v)}`,
    display: (v) => v,
  },
  whatsapp: {
    kind: "whatsapp",
    label: "WhatsApp",
    group: "contact",
    placeholder: "+34 600 000 000",
    inputMode: "tel",
    normalize: (raw) => normalizePhone(raw, true),
    href: (v) => `https://wa.me/${digitsOnly(v)}`,
    display: (v) => v,
  },
  linkedin: {
    kind: "linkedin",
    label: "LinkedIn",
    group: "social",
    placeholder: "linkedin.com/in/tu-perfil",
    inputMode: "url",
    normalize: normalizeLinkedIn,
    href: (v) => v,
    display: (v) => {
      const match = v.match(/linkedin\.com\/(in|company|school|pub)\/([^/?#]+)/i);
      if (!match) return prettyUrl(v);
      try {
        return `${match[1]}/${decodeURIComponent(match[2])}`;
      } catch {
        return `${match[1]}/${match[2]}`;
      }
    },
  },
  website: {
    kind: "website",
    label: "Web",
    group: "web",
    placeholder: "tuweb.com",
    inputMode: "url",
    normalize: normalizeUrl,
    href: (v) => v,
    display: prettyUrl,
  },
  instagram: {
    kind: "instagram",
    label: "Instagram",
    group: "social",
    placeholder: "@usuario",
    inputMode: "text",
    normalize: (raw) => normalizeHandle(raw, INSTAGRAM),
    href: socialHref("https://www.instagram.com/"),
    display: (v) => `@${v}`,
  },
  x: {
    kind: "x",
    label: "X",
    group: "social",
    placeholder: "@usuario",
    inputMode: "text",
    normalize: (raw) => normalizeHandle(raw, X_RULE),
    href: socialHref("https://x.com/"),
    display: (v) => `@${v}`,
  },
  github: {
    kind: "github",
    label: "GitHub",
    group: "social",
    placeholder: "usuario",
    inputMode: "text",
    normalize: (raw) => normalizeHandle(raw, GITHUB),
    href: socialHref("https://github.com/"),
    display: (v) => v,
  },
  tiktok: {
    kind: "tiktok",
    label: "TikTok",
    group: "social",
    placeholder: "@usuario",
    inputMode: "text",
    normalize: (raw) => normalizeHandle(raw, TIKTOK),
    href: (v) => `https://www.tiktok.com/@${encodeURIComponent(v)}`,
    display: (v) => `@${v}`,
  },
  youtube: {
    kind: "youtube",
    label: "YouTube",
    group: "social",
    placeholder: "@canal",
    inputMode: "url",
    normalize: normalizeYouTube,
    href: (v) => v,
    display: (v) => {
      const match = v.match(/youtube\.com\/(@[^/?#]+)/i);
      return match ? match[1] : prettyUrl(v);
    },
  },
  telegram: {
    kind: "telegram",
    label: "Telegram",
    group: "contact",
    placeholder: "@usuario",
    inputMode: "text",
    normalize: (raw) => normalizeHandle(raw, TELEGRAM),
    href: socialHref("https://t.me/"),
    display: (v) => `@${v}`,
  },
  booking: {
    kind: "booking",
    // "Agendar reunión" is PassMe's own feature now; this is a link to an external booking page.
    label: "Enlace de reservas",
    group: "web",
    placeholder: "calendly.com/tu-usuario",
    inputMode: "url",
    normalize: normalizeUrl,
    href: (v) => v,
    display: prettyUrl,
  },
  custom: {
    kind: "custom",
    label: "Otra web",
    group: "web",
    placeholder: "https://…",
    inputMode: "url",
    normalize: normalizeUrl,
    href: (v) => v,
    display: prettyUrl,
  },
};

export function isLinkKind(value: unknown): value is LinkKind {
  return typeof value === "string" && (LINK_KINDS as readonly string[]).includes(value);
}

export function getLinkKind(kind: LinkKind): LinkKindDef {
  return DEFS[kind];
}

export function normalizeLinkValue(kind: LinkKind, raw: string): NormalizeResult {
  if (raw.length > MAX_VALUE_LENGTH) return fail("Demasiado largo.");
  return DEFS[kind].normalize(raw);
}

export function linkHref(kind: LinkKind, value: string): string {
  return DEFS[kind].href(value);
}

/** Title shown for a link: the custom label if present, else the kind's name. */
export function linkTitle(link: { kind: LinkKind; label?: string }): string {
  return link.label?.trim() || DEFS[link.kind].label;
}

export function linkDisplay(kind: LinkKind, value: string): string {
  return DEFS[kind].display(value);
}

/** True when a link opens a URL (vs. mailto:/tel:). */
export function isWebLink(kind: LinkKind): boolean {
  return kind !== "email" && kind !== "phone";
}
