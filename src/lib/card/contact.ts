/**
 * "Te dejo mi contacto": details a visitor leaves for the card owner.
 * Isomorphic — the public form and the server action share this validation.
 * Keep the limits in sync with supabase/migrations/20260929130000_contact_requests.sql.
 */
import { z } from "zod";
import { linkHref, normalizeLinkValue } from "./links";
import { line, paragraph, toFieldErrors, type FieldErrors } from "./schema";
import { escapeText, foldLine, splitName } from "./vcard";

export const CONTACT_LIMITS = { name: 80, email: 254, phone: 30, company: 80, message: 500 } as const;

/** Optional single-line field: empty → null, otherwise normalized by `normalize`. */
function optionalContact(kind: "email" | "phone", max: number) {
  return z
    .string()
    .max(max * 2)
    .transform((raw, ctx) => {
      const value = raw.trim();
      if (!value) return null;
      const normalized = normalizeLinkValue(kind, value);
      if (!normalized.ok || normalized.value.length > max) {
        ctx.addIssue({ code: "custom", message: normalized.ok ? "Demasiado largo." : normalized.error });
        return z.NEVER;
      }
      // Legal in theory, but only ever seen in attempts to smuggle mailto: headers.
      if (kind === "email" && /[?&=%#/]/.test(normalized.value)) {
        ctx.addIssue({ code: "custom", message: "Email no válido." });
        return z.NEVER;
      }
      return normalized.value;
    });
}

/** Shown under the phone and email fields when both are empty. */
export const CONTACT_ONE_OF_ERROR = "Deja tu móvil o tu email: con uno basta.";

/** Also run a refinement when other fields failed, so the visitor sees every problem at once. */
const always = ({ value }: { value: unknown }) => typeof value === "object" && value !== null;

export const contactRequestSchema = z
  .object({
    name: line(CONTACT_LIMITS.name).pipe(z.string().min(1, "Dinos cómo te llamas.")),
    email: optionalContact("email", CONTACT_LIMITS.email),
    phone: optionalContact("phone", CONTACT_LIMITS.phone),
    company: line(CONTACT_LIMITS.company),
    message: paragraph(CONTACT_LIMITS.message),
    consent: z.literal(true, { error: "Marca la casilla para poder enviar tus datos." }),
  })
  // Neither phone nor email: both fields are marked, so it's clear either one will do.
  .refine((value) => Boolean(value.email || value.phone), { path: ["phone"], message: CONTACT_ONE_OF_ERROR, when: always })
  .refine((value) => Boolean(value.email || value.phone), { path: ["email"], message: CONTACT_ONE_OF_ERROR, when: always });

export type ValidContactRequest = z.output<typeof contactRequestSchema>;

export type ParseContactResult = { ok: true; data: ValidContactRequest } | { ok: false; errors: FieldErrors };

export function parseContactRequest(input: unknown): ParseContactResult {
  const result = contactRequestSchema.safeParse(input);
  return result.success ? { ok: true, data: result.data } : { ok: false, errors: toFieldErrors(result.error) };
}

/** A stored request as the owner sees it. */
export interface ContactRequest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string;
  message: string;
  source: "direct" | "qr" | "share";
  createdAt: string;
}

export function contactEmailHref(email: string): string {
  return linkHref("email", email);
}

export function contactPhoneHref(phone: string): string {
  return linkHref("phone", phone);
}

function contactVCard(request: ContactRequest, note: string): string {
  const { given, family } = splitName(request.name);
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${escapeText(family)};${escapeText(given)};;;`, `FN:${escapeText(request.name)}`];
  if (request.company) lines.push(`ORG:${escapeText(request.company)}`);
  if (request.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeText(request.email)}`);
  if (request.phone) lines.push(`TEL;TYPE=CELL:${contactPhoneHref(request.phone).replace(/^tel:/, "")}`);
  const text = [request.message, note].filter(Boolean).join("\n\n");
  if (text) lines.push(`NOTE:${escapeText(text)}`);
  lines.push("END:VCARD");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** One .vcf with every request (Contacts imports them all at once). */
export function contactRequestsToVCard(requests: ContactRequest[]): string {
  return requests
    .map((r) => contactVCard(r, `Contacto recibido con PassMe el ${r.createdAt.slice(0, 10)}`))
    .join("");
}

/**
 * Quotes every cell and neutralizes spreadsheet formulas (CSV injection).
 * Phones are exempt: they are validated to digits and + ( ) . - only, so a
 * leading "+" can't start a dangerous formula and must stay readable.
 */
function csvCell(value: string, { isPhone = false } = {}): string {
  const safe = !isPhone && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const CSV_HEADER = ["Fecha", "Nombre", "Email", "Teléfono", "Empresa", "Mensaje", "Origen"];
const BOM = String.fromCharCode(0xfeff);

/** CSV (UTF-8 with BOM so Excel opens accents correctly). */
export function contactRequestsToCsv(requests: ContactRequest[]): string {
  const header = CSV_HEADER.map((cell) => csvCell(cell)).join(",");
  const rows = requests.map((r) =>
    [
      csvCell(r.createdAt),
      csvCell(r.name),
      csvCell(r.email ?? ""),
      csvCell(r.phone ?? "", { isPhone: true }),
      csvCell(r.company),
      csvCell(r.message),
      csvCell(r.source),
    ].join(","),
  );
  return `${BOM}${[header, ...rows].join("\r\n")}\r\n`;
}
