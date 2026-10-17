/**
 * /crear's rules for its draft: picking up the one this browser kept (a
 * reload, a closed tab, the landing's "Hazla tuya") and keeping its email in
 * step with the sign-in. Pure, so they can be tested without a browser.
 */
import { DESIGN_PARAMS, type ChosenDesign } from "@/lib/card/design-query";
import type { QuickCardDraft } from "@/lib/card/quick";

interface RestoreContext {
  /** The signed-in account's email, if any: it fills a draft that has none. */
  accountEmail: string | null;
  /** This visit's design: from the link (?tema=…) or picked at random by the server. */
  initialDesign: ChosenDesign;
  /** The link carries a design that was chosen just now (the landing): it beats the stored one. */
  designChosen: boolean;
}

export function restoreDraft(stored: QuickCardDraft, { accountEmail, initialDesign, designChosen }: RestoreContext): QuickCardDraft {
  return {
    ...stored,
    email: stored.email || accountEmail || "",
    // 0 / "" is what an incomplete stored draft gets: keep this visit's variation and color instead.
    patternSeed: stored.patternSeed || initialDesign.patternSeed,
    theme: stored.theme || initialDesign.theme,
    ...(designChosen ? initialDesign : {}),
  };
}

/**
 * The same address without the design (?tema=…&motivo=…&letra=…&variacion=…),
 * or null when there's none to remove. Once the landing's choice is in the
 * draft, the link has done its job: left in the address bar, every reload
 * would paint over a color picked since.
 */
export function withoutDesignQuery(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const names = Object.values(DESIGN_PARAMS);
  if (!names.some((name) => url.searchParams.has(name))) return null;
  for (const name of names) url.searchParams.delete(name);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

/** Most edits a correction of a typed address takes ("gmial" → "gmail" is 2). */
const TYPO_DISTANCE = 2;

/** Levenshtein distance, stopping early once it can't stay within `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    if (Math.min(...current) > max) return max + 1;
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * "Cambiar email" on the code step: when the code had gone to the card's own
 * email and the new address is a correction of it (a typo), the card takes the
 * corrected address too. Returns the card's new email, or null to leave it
 * alone: the code went to another address on purpose (a work email on the card,
 * a personal inbox for the code), or nothing changed. Code emails are lowercased.
 */
export function cardEmailAfterCodeChange(previousCodeEmail: string | null, codeEmail: string | null, cardEmail: string): string | null {
  if (!previousCodeEmail || !codeEmail || previousCodeEmail === codeEmail) return null;
  if (previousCodeEmail !== cardEmail.trim().toLowerCase()) return null;
  return editDistance(previousCodeEmail, codeEmail, TYPO_DISTANCE) <= TYPO_DISTANCE ? codeEmail : null;
}
