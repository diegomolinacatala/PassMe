import "server-only";
import type { AdminRawData, RawUser } from "@/lib/admin/stats";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { ProfileEventKind } from "@/lib/supabase/database.types";

/**
 * Raw rows for the private dashboard (/admin), read with the secret key.
 * Pages are ordered by a unique key, so no row is skipped or counted twice. Each
 * part loads on its own: one failing (a pending migration, a timeout) leaves
 * it empty with a warning instead of breaking the page. Row caps keep a
 * request bounded; past them the page says the numbers are partial.
 */

const PAGE_SIZE = 1000; // PostgREST's default max rows per response.
const MAX_ROWS = 50_000;
const MAX_USER_PAGES = 20;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

interface Paged<T> {
  rows: T[];
  error: boolean;
  truncated: boolean;
}

async function fetchPaged<T>(fetchPage: (from: number, to: number) => PageResult<T>): Promise<Paged<T>> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error || !data) {
      log.warn("admin stats query failed", { from }, error);
      return { rows, error: true, truncated: false };
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { rows, error: false, truncated: false };
  }
  return { rows, error: false, truncated: true };
}

function note(warnings: string[], what: string, result: { error: boolean; truncated?: boolean }): void {
  if (result.error) warnings.push(`No se han podido cargar ${what}.`);
  else if (result.truncated) warnings.push(`Hay más de ${MAX_ROWS.toLocaleString("es-ES")} ${what}: las cifras son parciales.`);
}

async function listAuthUsers(admin: NonNullable<ReturnType<typeof createAdminSupabase>>): Promise<Paged<RawUser>> {
  const rows: RawUser[] = [];
  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) {
      log.warn("admin stats: listUsers failed", { page }, error);
      return { rows, error: true, truncated: false };
    }
    rows.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      })),
    );
    if (data.users.length < PAGE_SIZE) return { rows, error: false, truncated: false };
  }
  return { rows, error: false, truncated: true };
}

/** Null without the secret key (demo mode): the page shows sample data instead. */
export async function loadAdminRawData(days: number, now: Date): Promise<AdminRawData | null> {
  const admin = createAdminSupabase();
  if (!admin) return null;

  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const [users, profiles, registrations, events, contactRequests, meetings] = await Promise.all([
    listAuthUsers(admin),
    fetchPaged((from, to) =>
      admin
        .from("profiles")
        .select("id, slug, full_name, is_published, pattern, created_at")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    // Never the push tokens: only which card is on which device.
    fetchPaged((from, to) =>
      admin
        .from("apple_pass_registrations")
        .select("serial_number, device_library_id")
        .order("device_library_id")
        .order("serial_number")
        .range(from, to),
    ),
    fetchPaged((from, to) =>
      admin
        .from("profile_events")
        .select("profile_id, kind, source, created_at")
        .gte("created_at", since)
        .order("id")
        .range(from, to),
    ),
    // Counts only: the people who left their details aren't PassMe users.
    fetchPaged((from, to) =>
      admin.from("contact_requests").select("profile_id, created_at").order("id").range(from, to),
    ),
    fetchPaged((from, to) =>
      admin.from("meeting_requests").select("profile_id, status, created_at").order("id").range(from, to),
    ),
  ]);

  const warnings: string[] = [];
  note(warnings, "los usuarios", users);
  note(warnings, "las tarjetas", profiles);
  note(warnings, "los pases de Apple Wallet", registrations);
  note(warnings, "los eventos", events);
  note(warnings, "los contactos recibidos", contactRequests);
  note(warnings, "las reuniones", meetings);

  return {
    demo: false,
    users: users.rows,
    profiles: profiles.rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      fullName: p.full_name,
      isPublished: p.is_published,
      pattern: p.pattern,
      createdAt: p.created_at,
    })),
    registrations: registrations.rows.map((r) => ({ serial: r.serial_number, device: r.device_library_id })),
    events: events.rows.map((e) => ({
      profileId: e.profile_id,
      kind: e.kind as ProfileEventKind,
      source: e.source,
      createdAt: e.created_at,
    })),
    contactRequests: contactRequests.rows.map((c) => ({ profileId: c.profile_id, createdAt: c.created_at })),
    meetings: meetings.rows.map((m) => ({ profileId: m.profile_id, status: m.status, createdAt: m.created_at })),
    warnings,
  };
}
