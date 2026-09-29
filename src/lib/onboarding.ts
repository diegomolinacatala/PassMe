import "server-only";
import { createPath, parseQuickDraft, welcomePath } from "@/lib/card/quick";
import type { FieldErrors } from "@/lib/card/schema";
import { createCardFromDraft } from "@/lib/data/cards";
import { log } from "@/lib/log";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

/** A quick-card draft travels as JSON in a form field; anything bigger than this isn't one. */
const MAX_DRAFT_JSON_LENGTH = 4_000;

/**
 * A card saved this recently was made by this very flow (another tab of the
 * same browser got there first), so it still deserves the welcome screen.
 */
const JUST_CREATED_MS = 3 * 60_000;

/** Where an account that already had a card lands: the editor, saying so. */
export const EXISTING_CARD_PATH = "/dashboard?existente=1";

export function parseDraftJson(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw || raw.length > MAX_DRAFT_JSON_LENGTH) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export type QuickCardOutcome = { ok: true; redirectTo: string } | { ok: false; error: string; errors?: FieldErrors };

const UNEXPECTED = "No hemos podido crear tu tarjeta. Inténtalo de nuevo.";

/**
 * Creates the signed-in user's first card from the quick form and says where
 * to go next: the welcome screen, or the editor when they already had a card
 * (it is never overwritten). Never throws: it runs right after a one-time code
 * was spent, so a database hiccup must end in a retry, not an error page.
 */
export async function createQuickCard(
  supabase: TypedSupabaseClient,
  userId: string,
  draftInput: unknown,
  from: string | null,
  now: number = Date.now(),
): Promise<QuickCardOutcome> {
  const parsed = parseQuickDraft(draftInput);
  if (!parsed.ok) return { ok: false, error: "Revisa los campos marcados.", errors: parsed.errors };
  try {
    const result = await createCardFromDraft(supabase, userId, parsed.data);
    if (!result.ok) return { ok: false, error: result.error };
    const justCreated = result.created || now - Date.parse(result.card.updatedAt) < JUST_CREATED_MS;
    return { ok: true, redirectTo: justCreated ? welcomePath(from) : EXISTING_CARD_PATH };
  } catch (error) {
    log.error("createQuickCard failed", { userId }, error);
    return { ok: false, error: UNEXPECTED };
  }
}

/** Where to send someone whose draft couldn't be used: back to the form, which still has it. */
export function draftFallbackPath(from: string | null): string {
  return createPath(from);
}
