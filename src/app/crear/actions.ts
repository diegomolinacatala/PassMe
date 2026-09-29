"use server";

import { redirect } from "next/navigation";
import { parseFromSlug, welcomePath } from "@/lib/card/quick";
import type { FieldErrors } from "@/lib/card/schema";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { createQuickCard, parseDraftJson } from "@/lib/onboarding";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export type CreateCardActionResult = { ok: false; error: string; errors?: FieldErrors };

const createLimiter = createSharedRateLimiter({ name: "create-card-user", limit: 10, windowMs: 10 * 60_000 });

/**
 * "Crear mi tarjeta" for someone already signed in (back from Google or the
 * email's button, or an account that never finished its card). Guests create
 * theirs in the same request that checks their login code (login/actions.ts).
 */
export async function createMyCardAction(draftJson: string, from: string | null): Promise<CreateCardActionResult> {
  const origin = parseFromSlug(from);
  const supabase = await createServerSupabase();
  // Demo mode: nothing to store, so show the welcome screen with the sample card.
  if (!supabase) redirect(welcomePath(origin));

  const user = await getSessionUser(supabase);
  if (!user) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };
  if (!(await createLimiter.check(user.id)).ok) {
    return { ok: false, error: "Demasiados intentos seguidos. Espera unos minutos." };
  }

  const outcome = await createQuickCard(supabase, user.id, parseDraftJson(draftJson), origin);
  if (!outcome.ok) return { ok: false, error: outcome.error, errors: outcome.errors };
  redirect(outcome.redirectTo);
}
