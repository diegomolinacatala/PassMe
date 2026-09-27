import { z } from "zod";
import { HEX_COLOR_RE } from "./colors";
import { LINK_KINDS, normalizeLinkValue } from "./links";
import { checkSlug, SLUG_ERRORS } from "./slug";
import type { CardLink } from "./types";

export const MAX_LINKS = 20;
export const LIMITS = {
  fullName: 80,
  headline: 80,
  company: 80,
  location: 80,
  pronouns: 30,
  bio: 280,
  linkLabel: 40,
  linkValue: 300,
} as const;

const LINK_ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const tooLong = (max: number) => `Máximo ${max} caracteres.`;

/** Single-line text: strips control chars and collapses whitespace. */
const line = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL_CHARS_RE, "").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max, tooLong(max)));

/** Multi-line text (bio): keeps newlines but caps consecutive blank lines. */
const paragraph = (max: number) =>
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

const linkSchema = z.object({
  id: z.string().regex(LINK_ID_RE, "Id de enlace no válido."),
  kind: z.enum(LINK_KINDS, { error: "Tipo de enlace no válido." }),
  value: z.string().max(LIMITS.linkValue, tooLong(LIMITS.linkValue)),
  label: line(LIMITS.linkLabel).optional(),
  visible: z.boolean(),
});

export const cardInputSchema = z
  .object({
    slug: z.string().trim().toLowerCase(),
    fullName: line(LIMITS.fullName).pipe(z.string().min(1, "Tu nombre es obligatorio.")),
    headline: line(LIMITS.headline),
    company: line(LIMITS.company),
    location: line(LIMITS.location),
    pronouns: line(LIMITS.pronouns),
    bio: paragraph(LIMITS.bio),
    accentColor: z.string().regex(HEX_COLOR_RE, "Color no válido."),
    avatarPath: z.string().max(200).nullable(),
    isPublished: z.boolean(),
    links: z.array(linkSchema).max(MAX_LINKS, `Máximo ${MAX_LINKS} enlaces.`),
  })
  .superRefine((card, ctx) => {
    const slug = checkSlug(card.slug);
    if (!slug.ok) ctx.addIssue({ code: "custom", path: ["slug"], message: SLUG_ERRORS[slug.reason] });

    const seen = new Set<string>();
    card.links.forEach((link, i) => {
      if (seen.has(link.id)) {
        ctx.addIssue({ code: "custom", path: ["links", i, "id"], message: "Enlace duplicado." });
      }
      seen.add(link.id);

      const normalized = normalizeLinkValue(link.kind, link.value);
      if (!normalized.ok) {
        ctx.addIssue({ code: "custom", path: ["links", i, "value"], message: normalized.error });
      }
      if (link.kind === "custom" && !link.label) {
        ctx.addIssue({ code: "custom", path: ["links", i, "label"], message: "Ponle un título al enlace." });
      }
    });
  })
  .transform((card) => ({
    ...card,
    links: card.links.map((link): CardLink => {
      const normalized = normalizeLinkValue(link.kind, link.value);
      return {
        id: link.id,
        kind: link.kind,
        value: normalized.ok ? normalized.value : link.value,
        ...(link.label ? { label: link.label } : {}),
        visible: link.visible,
      };
    }),
  }));

export type CardInput = z.input<typeof cardInputSchema>;
export type ValidCardInput = z.output<typeof cardInputSchema>;

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

export type ParseCardResult =
  | { ok: true; data: ValidCardInput }
  | { ok: false; errors: FieldErrors };

export function parseCardInput(input: unknown): ParseCardResult {
  const result = cardInputSchema.safeParse(input);
  return result.success ? { ok: true, data: result.data } : { ok: false, errors: toFieldErrors(result.error) };
}

/** Validates links stored as JSON in the database (defensive: data could predate a rule change). */
export function sanitizeStoredLinks(raw: unknown): CardLink[] {
  if (!Array.isArray(raw)) return [];
  const links: CardLink[] = [];
  for (const item of raw.slice(0, MAX_LINKS)) {
    const parsed = linkSchema.safeParse(item);
    if (!parsed.success) continue;
    const normalized = normalizeLinkValue(parsed.data.kind, parsed.data.value);
    if (!normalized.ok) continue;
    links.push({
      id: parsed.data.id,
      kind: parsed.data.kind,
      value: normalized.value,
      ...(parsed.data.label ? { label: parsed.data.label } : {}),
      visible: parsed.data.visible,
    });
  }
  return links;
}
