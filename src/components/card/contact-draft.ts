import type { ContactFormValues } from "@/app/u/[slug]/actions";
import { CONTACT_LIMITS } from "@/lib/card/contact-info";

/**
 * What was typed in "Déjale tu contacto" survives a trip to "Más info" (another
 * tab) or closing the panel, until the tab is closed. Storage may be blocked:
 * then it just isn't kept.
 */

export type DraftFields = Pick<ContactFormValues, "name" | "phone" | "email" | "company" | "message">;
const DRAFT_FIELDS = ["name", "phone", "email", "company", "message"] as const;

const draftKey = (slug: string) => `passme:contact-draft:${slug}`;

export function readDraft(slug: string): Partial<DraftFields> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(draftKey(slug)) ?? "null");
    if (!parsed || typeof parsed !== "object") return {};
    const record = parsed as Record<string, unknown>;
    const draft: Partial<DraftFields> = {};
    for (const field of DRAFT_FIELDS) {
      const value = record[field];
      if (typeof value === "string") draft[field] = value.slice(0, CONTACT_LIMITS[field]);
    }
    return draft;
  } catch {
    return {};
  }
}

export function writeDraft(slug: string, form: HTMLFormElement): void {
  const data = new FormData(form);
  const draft: Partial<DraftFields> = {};
  for (const field of DRAFT_FIELDS) {
    const value = data.get(field);
    if (typeof value === "string" && value) draft[field] = value;
  }
  try {
    sessionStorage.setItem(draftKey(slug), JSON.stringify(draft));
  } catch {
    // Storage blocked (private mode, embedded browsers): nothing to keep.
  }
}

export function clearDraft(slug: string): void {
  try {
    sessionStorage.removeItem(draftKey(slug));
  } catch {
    // Same as above.
  }
}
