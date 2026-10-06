import { z } from "zod";

/**
 * Text rules shared by the card and the meeting schemas. A module of its own so
 * src/lib/meetings/schema.ts can use them without importing the card schema
 * (which imports the meeting settings: that would be a cycle).
 */

// Control characters, plus the invisible and bidirectional ones that can disguise text
// (zero-width space, LRM/RLM, embeddings and isolates, BOM). ZWJ/ZWNJ stay: emoji and scripts use them.
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export const tooLong = (max: number) => `Máximo ${max} caracteres.`;

/** Single-line text: strips control chars and collapses whitespace. */
export const line = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL_CHARS_RE, "").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max, tooLong(max)));

/** Multi-line text (bio): keeps newlines but caps consecutive blank lines. */
export const paragraph = (max: number) =>
  z
    .string()
    .transform((s) =>
      s
        .replace(/\r\n?/g, "\n")
        .replace(CONTROL_CHARS_RE, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    )
    .pipe(z.string().max(max, tooLong(max)));

/** Flat `path -> message` map (e.g. `links.2.value`) for inline form errors. */
export type FieldErrors = Record<string, string>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    errors[key] ??= issue.message;
  }
  return errors;
}
