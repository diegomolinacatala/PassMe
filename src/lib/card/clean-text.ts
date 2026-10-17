/**
 * Text cleaning shared by the zod schemas (./text) and by the plain validators
 * that run in the browser (./quick-form). No zod here, so client code can
 * import it without pulling the validation library into the bundle.
 */

// Control characters, plus the invisible and bidirectional ones that can disguise text
// (zero-width space, LRM/RLM, embeddings and isolates, BOM). ZWJ/ZWNJ stay: emoji and scripts use them.
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export const tooLong = (max: number) => `Máximo ${max} caracteres.`;

/** Single-line text: strips control chars and collapses whitespace. */
export function cleanLine(text: string): string {
  return text.replace(CONTROL_CHARS_RE, "").replace(/\s+/g, " ").trim();
}

/** Multi-line text (bio): keeps newlines but caps consecutive blank lines. */
export function cleanParagraph(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS_RE, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Flat `path -> message` map (e.g. `links.2.value`) for inline form errors. */
export type FieldErrors = Record<string, string>;
