/**
 * "Crea la tuya", the validating half: /crear checks the draft with this while
 * it is typed and the server checks it again before creating the card (and then
 * parseCardInput checks the card itself). Plain code, no zod, so /crear doesn't
 * ship the validation library; tests/quick-parity.test.ts compares it with the
 * zod schema it replaced.
 */
import { cleanLine, tooLong, type FieldErrors } from "./clean-text";
import { CARD_THEMES, DEFAULT_THEME, themeDesign } from "./design";
import { LIMITS } from "./limits";
import { normalizeLinkValue } from "./links";
import {
  CONTACT_ERROR_KEY,
  QUICK_LINK_FIELDS,
  coerceQuickDraft,
  type QuickCardDraft,
} from "./quick-draft";
import type { CardInput } from "./schema";
import { suggestSlug } from "./slug";
import type { CardLink, PublicCard } from "./types";

/** A draft that passed: names cleaned, contacts normalized, theme known. */
export interface ValidQuickDraft {
  fullName: string;
  headline: string;
  company: string;
  phone: string;
  email: string;
  linkedin: string;
  theme: string;
  patternSeed: number;
  pattern: QuickCardDraft["pattern"];
  typeface: QuickCardDraft["typeface"];
}

export type ParseQuickDraftResult = { ok: true; data: ValidQuickDraft } | { ok: false; errors: FieldErrors };

const CONTACT_REQUIRED = "Añade al menos un teléfono, un email o tu LinkedIn: es lo que guardarán de ti.";

export function parseQuickDraft(input: unknown): ParseQuickDraftResult {
  const draft = coerceQuickDraft(input);
  const errors: FieldErrors = {};

  const text = (field: "fullName" | "headline" | "company", max: number): string => {
    const value = cleanLine(draft[field]);
    if (value.length > max) errors[field] = tooLong(max);
    return value;
  };
  const fullName = text("fullName", LIMITS.fullName);
  if (!fullName && !errors.fullName) errors.fullName = "Tu nombre es obligatorio.";
  const headline = text("headline", LIMITS.headline);
  const company = text("company", LIMITS.company);

  const contact = (field: "phone" | "email" | "linkedin"): string => {
    if (!draft[field].trim()) return "";
    const normalized = normalizeLinkValue(field, draft[field]);
    if (normalized.ok) return normalized.value;
    errors[field] = normalized.error;
    return "";
  };
  const phone = contact("phone");
  const email = contact("email");
  const linkedin = contact("linkedin");
  // Also checked when the name or other text failed, so every problem shows at once; but a contact that was
  // typed and is wrong already has its own message, and "add one" on top of it would only confuse.
  const contactFailed = Boolean(errors.phone || errors.email || errors.linkedin);
  if (!phone && !email && !linkedin && !contactFailed) errors[CONTACT_ERROR_KEY] = CONTACT_REQUIRED;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      fullName,
      headline,
      company,
      phone,
      email,
      linkedin,
      theme: CARD_THEMES.some((theme) => theme.id === draft.theme) ? draft.theme : DEFAULT_THEME.id,
      patternSeed: draft.patternSeed,
      pattern: draft.pattern,
      typeface: draft.typeface,
    },
  };
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
    ...themeDesign(draft.theme, draft.pattern, draft.patternSeed, draft.typeface),
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
    ...themeDesign(draft.theme, draft.pattern, draft.patternSeed, draft.typeface),
    avatarUrl: null,
    links,
    acceptsContactRequests: false,
    acceptsMeetingRequests: false,
  };
}
