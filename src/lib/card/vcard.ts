/**
 * vCard 3.0 builder (RFC 2426). 3.0 is still the most compatible version for
 * "Add to contacts" on both iOS and Android. Only visible links are included.
 */
import { isWebLink, linkHref, linkTitle } from "./links";
import type { PublicCard } from "./types";

const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

export interface VCardPhoto {
  /** Base64 image data without the data: prefix. */
  base64: string;
  type: "JPEG" | "PNG";
}

export interface VCardOptions {
  profileUrl: string;
  photo?: VCardPhoto | null;
  /** Appended to the note ("Guardado con PassMe el …"), so the contact says where it came from. */
  savedNote?: string;
}

/** Escapes TEXT values: backslash, newline, comma and semicolon. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** URI values are not TEXT-escaped (commas are legal); only line breaks are removed. */
function uri(value: string): string {
  return value.replace(/[\r\n]/g, "");
}

/** Folds a content line at 75 octets without splitting multi-byte characters. */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line;

  const parts: string[] = [];
  let current = "";
  let currentOctets = 0;
  // Continuation lines start with a space, which counts toward their 75 octets.
  let limit = MAX_LINE_OCTETS;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentOctets + size > limit) {
      parts.push(current);
      current = "";
      currentOctets = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += char;
    currentOctets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/**
 * Best-effort split into given/family names, Spanish style: with three words or
 * more the last two are the surnames ("Ana María López Gil" → "Ana María" /
 * "López Gil"); with two, one each.
 */
export function splitName(fullName: string): { given: string; family: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { given: parts[0] ?? "", family: "" };
  const surnames = parts.length >= 3 ? 2 : 1;
  return { given: parts.slice(0, -surnames).join(" "), family: parts.slice(-surnames).join(" ") };
}

export function buildVCard(card: PublicCard, { profileUrl, photo, savedNote }: VCardOptions): string {
  const { given, family } = splitName(card.fullName);
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  lines.push(`N:${escapeText(family)};${escapeText(given)};;;`);
  lines.push(`FN:${escapeText(card.fullName)}`);
  if (card.company) lines.push(`ORG:${escapeText(card.company)}`);
  if (card.headline) lines.push(`TITLE:${escapeText(card.headline)}`);
  if (card.location) lines.push(`ADR;TYPE=WORK:;;;${escapeText(card.location)};;;`);

  const seenPhones = new Set<string>();
  let item = 0;
  for (const link of card.links) {
    if (!link.visible) continue;

    if (link.kind === "email") {
      lines.push(`EMAIL;TYPE=INTERNET:${escapeText(link.value)}`);
      continue;
    }
    if (link.kind === "phone" || link.kind === "whatsapp") {
      const tel = linkHref("phone", link.value).replace(/^tel:/, "");
      if (!seenPhones.has(tel)) {
        seenPhones.add(tel);
        lines.push(`TEL;TYPE=CELL:${tel}`);
      }
      if (link.kind === "phone") continue;
    }
    if (isWebLink(link.kind)) {
      item += 1;
      lines.push(`item${item}.URL:${uri(linkHref(link.kind, link.value))}`);
      lines.push(`item${item}.X-ABLabel:${escapeText(linkTitle(link))}`);
    }
  }

  item += 1;
  lines.push(`item${item}.URL:${uri(profileUrl)}`);
  lines.push(`item${item}.X-ABLabel:PassMe`);

  const note = [card.bio, savedNote].filter(Boolean).join("\n\n");
  if (note) lines.push(`NOTE:${escapeText(note)}`);
  if (photo) lines.push(`PHOTO;ENCODING=b;TYPE=${photo.type}:${photo.base64}`);

  lines.push("END:VCARD");
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** Safe ASCII filename for Content-Disposition. */
export function vcardFilename(slug: string): string {
  return `${slug.replace(/[^a-z0-9-]/g, "") || "contacto"}.vcf`;
}

/**
 * "Alex Rivera.vcf" for the person's name (RFC 6266 filename*), with the slug
 * as the plain-ASCII fallback for old clients.
 */
export function vcardContentDisposition(disposition: "inline" | "attachment", fullName: string, slug: string): string {
  const clean = fullName.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const fallback = vcardFilename(slug);
  if (!clean) return `${disposition}; filename="${fallback}"`;
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(`${clean}.vcf`)}`;
}

/** "Guardado con PassMe el 05/10/2026 · getpassme.com/u/alex" (date in Spain's time zone). */
export function savedWithPassMeNote(prettyUrl: string, now: Date = new Date()): string {
  const date = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" }).format(now);
  return `Guardado con PassMe el ${date} · ${prettyUrl}`;
}
