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

export async function recordEventBySlug(slug: string, event: EventInput): Promise<void> {
  if (slug === DEMO_SLUG) return;
  const admin = createAdminSupabase();
  if (!admin) return;

  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error) {
    log.warn("recordEventBySlug lookup failed", { slug }, error);
    return;
  }
  if (data) await recordEventForProfile(data.id, event);
}
