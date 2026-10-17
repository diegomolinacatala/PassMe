/**
 * "Crea la tuya": the short form a newcomer fills in to get a card worth
 * sharing in a minute — the editor takes it from there. This is the draft
 * itself: its shape, its defaults and how stored JSON becomes one. Validation
 * and the card it turns into are in ./quick-form; the links to /crear are in
 * ./paths (re-exported here). No zod: the public card, the landing and /crear
 * all import this from the browser.
 */
import { DEFAULT_THEME, DEFAULT_TYPEFACE, isPatternSeed, isTypeface, type Typeface } from "./design";
import { LIMITS } from "./limits";
import type { LinkKind } from "./links";
import { DEFAULT_PATTERN, isPatternKind, type PatternKind } from "./pattern";

export { createPath, parseFromSlug, parseVia, welcomePath } from "./paths";

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
  /** Motif and typeface: the defaults, unless they were chosen on the landing ("Hazla tuya"). */
  pattern: PatternKind;
  typeface: Typeface;
}

export type QuickTextField = Exclude<keyof QuickCardDraft, "theme" | "patternSeed" | "pattern" | "typeface">;

export const EMPTY_QUICK_DRAFT: QuickCardDraft = {
  fullName: "",
  headline: "",
  company: "",
  phone: "",
  email: "",
  linkedin: "",
  theme: DEFAULT_THEME.id,
  patternSeed: 0,
  pattern: DEFAULT_PATTERN,
  typeface: DEFAULT_TYPEFACE,
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
    // Only current motifs: retired names never come from the form, and never from a link either.
    pattern: isPatternKind(source.pattern) ? source.pattern : EMPTY_QUICK_DRAFT.pattern,
    typeface: isTypeface(source.typeface) ? source.typeface : EMPTY_QUICK_DRAFT.typeface,
  };
}
