import { z } from "zod";
import { cleanLine, cleanParagraph, tooLong, type FieldErrors } from "./clean-text";

/**
 * Text rules shared by the card and the meeting schemas. A module of its own so
 * src/lib/meetings/schema.ts can use them without importing the card schema
 * (which imports the meeting settings: that would be a cycle). The cleaning
 * itself lives in ./clean-text, which has no zod and can reach the browser.
 */

export { tooLong, type FieldErrors };

/** Single-line text: strips control chars and collapses whitespace. */
export const line = (max: number) =>
  z
    .string()
    .transform((s) => cleanLine(s))
    .pipe(z.string().max(max, tooLong(max)));

/** Multi-line text (bio): keeps newlines but caps consecutive blank lines. */
export const paragraph = (max: number) =>
  z
    .string()
    .transform((s) => cleanParagraph(s))
    .pipe(z.string().max(max, tooLong(max)));

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    errors[key] ??= issue.message;
  }
  return errors;
}
