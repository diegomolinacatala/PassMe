import "server-only";
import { DEMO_SLUG } from "@/lib/card/demo";
import type { VisitSource } from "@/lib/env";
import { log } from "@/lib/log";
import type { VisitorContext } from "@/lib/request";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { ProfileEventKind } from "@/lib/supabase/database.types";

export interface EventInput {
  kind: ProfileEventKind;
  source?: VisitSource;
  linkId?: string | null;
  /** Kind of device and country of an anonymous visitor (migration 20261021120000). */
  visitor?: VisitorContext;
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

/** While migration 20261021120000 is pending, skip the new call for a minute instead of failing on every event. */
const RETRY_V2_AFTER_MS = 60_000;
let v2MissingUntil = 0;

type AdminClient = NonNullable<ReturnType<typeof createAdminSupabase>>;
type RpcError = { code?: string } | null;

/** With the visitor's device and country; "missing" until migration 20261021120000 is applied. */
async function recordWithVisitor(admin: AdminClient, slug: string, event: EventInput): Promise<RpcError> {
  const { error } = await admin.rpc("record_card_event_v2", {
    p_slug: slug,
    p_kind: event.kind,
    p_source: event.source ?? "direct",
    p_link_id: event.linkId ?? null,
    p_platform: event.visitor?.platform ?? null,
    p_country: event.visitor?.country ?? null,
  });
  return error;
}

/**
 * Events from anonymous visitors, keyed by slug. One round trip: the database
 * checks the card is published and, for clicks, that the link exists and is
 * visible — so nobody can pad the stats with made-up link ids.
 */
export async function recordEventBySlug(slug: string, event: EventInput): Promise<void> {
  if (slug === DEMO_SLUG) return;
  const admin = createAdminSupabase();
  if (!admin) return;

  if (Date.now() >= v2MissingUntil) {
    const v2Error = await recordWithVisitor(admin, slug, event);
    if (!v2Error) return;
    if (v2Error.code !== MISSING_FUNCTION) {
      log.warn("record_card_event_v2 failed", { slug, kind: event.kind }, v2Error);
      return;
    }
    v2MissingUntil = Date.now() + RETRY_V2_AFTER_MS;
  }

  // Before migration 20261021120000: the same event without device or country.
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
