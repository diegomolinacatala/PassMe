import { z } from "zod";
import { meetingSettingsSchema } from "@/lib/meetings/settings";
import { canonicalTimeZone } from "@/lib/meetings/time";
import { HEX_COLOR_RE } from "./colors";
import { PATTERN_SEED_MAX, TYPEFACES } from "./design";
import { PATTERN_KINDS } from "./pattern";
import { LINK_KINDS, normalizeLinkValue, toLinkKind } from "./links";
import { checkSlug, SLUG_ERRORS } from "./slug";
import { line, paragraph, toFieldErrors, tooLong, type FieldErrors } from "./text";
import type { CardLink } from "./types";

export const MAX_LINKS = 20;
/** Mirrors profiles_time_zone_format (migration 20261006120000). */
const TIME_ZONE_RE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;
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
export { line, paragraph, toFieldErrors, type FieldErrors } from "./text";

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
    detailColor: z.string().regex(HEX_COLOR_RE, "Color no válido.").nullable(),
    pattern: z.enum(PATTERN_KINDS, { error: "Motivo no válido." }),
    patternSeed: z.number().int().min(0).max(PATTERN_SEED_MAX, "Variación no válida."),
    typeface: z.enum(TYPEFACES, { error: "Letra no válida." }),
    avatarPath: z.string().max(200).nullable(),
    isPublished: z.boolean(),
    // Optional so an editor tab opened before this field existed can still save.
    acceptsContactRequests: z.boolean().optional(),
    acceptsMeetingRequests: z.boolean().optional(),
    // The owner's zone, from their browser on each save. An unknown one is ignored (the column keeps its value).
    timeZone: z
      .string()
      .max(64)
      // Same shape as the profiles_time_zone_format CHECK: a zone it would refuse must never block a save.
      .transform((zone) => {
        const canonical = canonicalTimeZone(zone);
        return canonical && TIME_ZONE_RE.test(canonical) ? canonical : undefined;
      })
      .optional(),
    // «Ajustes de reuniones»: absent from editors opened before the migration.
    meetingSettings: meetingSettingsSchema.optional(),
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
    });
  })
  .transform((card) => ({
    ...card,
    links: card.links.map((link): CardLink => {
      const normalized = normalizeLinkValue(link.kind, link.value);
      return {
        id: link.id,
        kind: toLinkKind(link.kind),
        value: normalized.ok ? normalized.value : link.value,
        ...(link.label ? { label: link.label } : {}),
        visible: link.visible,
      };
    }),
  }));

export type CardInput = z.input<typeof cardInputSchema>;
export type ValidCardInput = z.output<typeof cardInputSchema>;

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
      kind: toLinkKind(parsed.data.kind),
      value: normalized.value,
      ...(parsed.data.label ? { label: parsed.data.label } : {}),
      visible: parsed.data.visible,
    });
  }
  return links;
}
