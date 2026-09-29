import "server-only";
import { DEMO_SLUG } from "@/lib/card/demo";
import type { VisitSource } from "@/lib/env";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { ProfileEventKind } from "@/lib/supabase/database.types";

export interface EventInput {
  kind: ProfileEventKind;
  source?: VisitSource;
  linkId?: string | null;
}

/**
 * Analytics are best-effort: failures are logged, never surfaced to visitors.
 * No IP addresses or cookies are stored — only counters per card.
 */
export async function recordEventForProfile(profileId: string, event: EventInput): Promise<void> {
  const admin = createAdminSupabase();
  if (!admin) return;

  const { error } = await admin.from("profile_events").insert({
    profile_id: profileId,
    kind: event.kind,
    source: event.source ?? "direct",
    link_id: event.linkId ?? null,
  });
  if (error) log.warn("recordEvent failed", { profileId, kind: event.kind }, error);
}

/** PostgREST code for "function not found" (a migration is still pending). */
const MISSING_FUNCTION = "PGRST202";

/**
 * Events from anonymous visitors, keyed by slug. One round trip: the database
 * checks the card is published and, for clicks, that the link exists and is
 * visible — so nobody can pad the stats with made-up link ids.
 */
export async function recordEventBySlug(slug: string, event: EventInput): Promise<void> {
  if (slug === DEMO_SLUG) return;
  const admin = createAdminSupabase();
  if (!admin) return;

  const { error } = await admin.rpc("record_card_event", {
    p_slug: slug,
    p_kind: event.kind,
    p_source: event.source ?? "direct",
    p_link_id: event.linkId ?? null,
  });
  if (!error) return;
  if (error.code !== MISSING_FUNCTION) {
    log.warn("record_card_event failed", { slug, kind: event.kind }, error);
    return;
  }

  // Before migration 20260929120000: look the card up, then insert.
  const { data, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (lookupError) {
    log.warn("recordEventBySlug lookup failed", { slug }, lookupError);
    return;
  }
  if (data) await recordEventForProfile(data.id, event);
}
