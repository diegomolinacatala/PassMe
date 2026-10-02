/**
 * "Crea la tuya": the short form a newcomer fills in to get a card worth
 * sharing in a minute — the editor takes it from there. Isomorphic: /crear
 * validates it while typing and the server validates it again before creating
 * the card.
 */
import { z } from "zod";
import { CARD_THEMES, DEFAULT_THEME, DEFAULT_TYPEFACE, isPatternSeed, PATTERN_SEED_MAX, themeDesign } from "./design";
import { normalizeLinkValue, type LinkKind } from "./links";
import { DEFAULT_PATTERN } from "./pattern";
import { LIMITS, line, toFieldErrors, type CardInput, type FieldErrors } from "./schema";
import { DEMO_SLUG } from "./demo";
import { checkSlug, suggestSlug } from "./slug";
import type { CardLink, PublicCard } from "./types";

export interface QuickCardDraft {
  fullName: string;
  headline: string;
  company: string;
  phone: string;
  email: string;
  linkedin: string;
  /** A CARD_THEMES id. */
  theme: string;
  /** Motif variation, picked when the form opens so the preview is exactly the card you get. */
  patternSeed: number;
}

export type QuickTextField = Exclude<keyof QuickCardDraft, "theme" | "patternSeed">;

export const EMPTY_QUICK_DRAFT: QuickCardDraft = {
  fullName: "",
  headline: "",
  company: "",
  phone: "",
  email: "",
  linkedin: "",
  theme: DEFAULT_THEME.id,
  patternSeed: 0,
};

/** Contact fields of the quick form, in the order they become card links. */
export const QUICK_LINK_FIELDS = [
  ["phone", "phone"],
  ["email", "email"],
  ["linkedin", "linkedin"],
] as const satisfies ReadonlyArray<readonly [QuickTextField, LinkKind]>;

/** Error key for "add at least one way to reach you". */
export const CONTACT_ERROR_KEY = "contact";

/** Anything (stored JSON, form data) → a draft with every field a string. */
export function coerceQuickDraft(raw: unknown): QuickCardDraft {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = (key: QuickTextField | "theme", max: number) => {
    const value = source[key];
    return typeof value === "string" ? value.slice(0, max) : EMPTY_QUICK_DRAFT[key];
  };
  return {
    fullName: text("fullName", LIMITS.fullName * 2),
    headline: text("headline", LIMITS.headline * 2),
    company: text("company", LIMITS.company * 2),
    phone: text("phone", LIMITS.linkValue),
    email: text("email", LIMITS.linkValue),
    linkedin: text("linkedin", LIMITS.linkValue),
    theme: text("theme", 40),
    patternSeed: isPatternSeed(source.patternSeed) ? source.patternSeed : EMPTY_QUICK_DRAFT.patternSeed,
  };
}

function optionalLink(kind: LinkKind) {
  return z
    .string()
    .max(LIMITS.linkValue)
    .transform((raw, ctx) => {
      if (!raw.trim()) return "";
      const normalized = normalizeLinkValue(kind, raw);
      if (!normalized.ok) {
        ctx.addIssue({ code: "custom", message: normalized.error });
        return z.NEVER;
      }
      return normalized.value;
    });
}

const quickDraftSchema = z
  .object({
    fullName: line(LIMITS.fullName).pipe(z.string().min(1, "Tu nombre es obligatorio.")),
    headline: line(LIMITS.headline),
    company: line(LIMITS.company),
    phone: optionalLink("phone"),
    email: optionalLink("email"),
    linkedin: optionalLink("linkedin"),
    theme: z.string().transform((id) => (CARD_THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME.id)),
    patternSeed: z.number().int().min(0).max(PATTERN_SEED_MAX),
  })
  .refine((draft) => Boolean(draft.phone || draft.email || draft.linkedin), {
    path: [CONTACT_ERROR_KEY],
    message: "Añade al menos un teléfono, un email o tu LinkedIn: es lo que guardarán de ti.",
    // Also run when other fields failed, so every problem shows at once.
    when: ({ value }) => typeof value === "object" && value !== null,
  });

export type ValidQuickDraft = z.output<typeof quickDraftSchema>;

export type ParseQuickDraftResult = { ok: true; data: ValidQuickDraft } | { ok: false; errors: FieldErrors };

export function parseQuickDraft(input: unknown): ParseQuickDraftResult {
  const result = quickDraftSchema.safeParse(coerceQuickDraft(input));
  return result.success ? { ok: true, data: result.data } : { ok: false, errors: toFieldErrors(result.error) };
}

/** The handle a quick card asks for first ("José Núñez" → "jose-nunez"). */
export function quickDraftSlug(draft: Pick<QuickCardDraft, "fullName">): string | null {
  return suggestSlug(draft.fullName);
}

interface CardInputOptions {
  slug: string;
  /** Link ids (random on the server; they only need to be unique within the card). */
  linkId: (index: number) => string;
}

/** The editor's full input for a card made from the quick form (re-validated by parseCardInput). */
export function quickDraftToCardInput(draft: ValidQuickDraft, { slug, linkId }: CardInputOptions): CardInput {
  const links = QUICK_LINK_FIELDS.filter(([field]) => draft[field]).map(
    ([field, kind], index): CardLink => ({ id: linkId(index), kind, value: draft[field], visible: true }),
  );
  return {
    slug,
    fullName: draft.fullName,
    headline: draft.headline,
    company: draft.company,
    location: "",
    pronouns: "",
    bio: "",
    ...themeDesign(draft.theme, DEFAULT_PATTERN, draft.patternSeed, DEFAULT_TYPEFACE),
    avatarPath: null,
    isPublished: true,
    links,
  };
}

/** Live preview of the card while the quick form is being filled in (only valid contacts show). */
export function quickDraftToPublicCard(draft: QuickCardDraft): PublicCard {
  const links = QUICK_LINK_FIELDS.flatMap(([field, kind]): CardLink[] => {
    const normalized = draft[field].trim() ? normalizeLinkValue(kind, draft[field]) : null;
    return normalized?.ok ? [{ id: `preview-${kind}`, kind, value: normalized.value, visible: true }] : [];
  });
  return {
    slug: quickDraftSlug(draft) ?? "tu-nombre",
    fullName: draft.fullName.trim(),
    headline: draft.headline.trim(),
    company: draft.company.trim(),
    location: "",
    pronouns: "",
    bio: "",
    ...themeDesign(draft.theme, DEFAULT_PATTERN, draft.patternSeed, DEFAULT_TYPEFACE),
    avatarUrl: null,
    links,
    acceptsContactRequests: false,
    acceptsMeetingRequests: false,
  };
}

/** Slug of the card that led someone to /crear (?de=…), or null when missing or malformed. */
export function parseFromSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return slug === DEMO_SLUG || checkSlug(slug).ok ? slug : null;
}

/** "Crea la tuya" link, remembering whose card it came from. */
export function createPath(from: string | null): string {
  return from ? `/crear?de=${encodeURIComponent(from)}` : "/crear";
}

/** Where a brand-new card lands: the editor's welcome, still remembering whose card led here. */
export function welcomePath(from: string | null): string {
  return `/dashboard?nueva=1${from ? `&de=${encodeURIComponent(from)}` : ""}`;
}
