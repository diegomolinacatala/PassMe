import "server-only";
import type { VisitSource } from "@/lib/env";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Postgres / PostgREST codes for "that table doesn't exist" (migration 20261021120000 pending). */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

/**
 * Notes, once per new card, whose card led to it (and how: scan, shared link)
 * or that the newcomer came on their own. Only the private CRM reads it.
 * Best effort and never throws (it runs right after a sign-up).
 */
export async function recordReferral(profileId: string, fromSlug: string | null, via: VisitSource): Promise<void> {
  try {
    const admin = createAdminSupabase();
    if (!admin) return;
    let referrerId: string | null = null;
    if (fromSlug) {
      const { data, error } = await admin.from("profiles").select("id").eq("slug", fromSlug).maybeSingle();
      if (error) {
        // No row rather than a wrong one: "on their own" could never be corrected afterwards.
        log.warn("referral lookup failed", { from: fromSlug }, error);
        return;
      }
      if (data && data.id !== profileId) referrerId = data.id;
    }
    const { error } = await admin
      .from("profile_referrals")
      .upsert(
        { profile_id: profileId, referrer_id: referrerId, via: referrerId ? via : "direct" },
        { onConflict: "profile_id", ignoreDuplicates: true },
      );
    if (error && !MISSING_TABLE_CODES.has(error.code ?? "")) log.warn("referral insert failed", { profileId }, error);
  } catch (error) {
    log.warn("referral failed", { profileId }, error);
  }
}
