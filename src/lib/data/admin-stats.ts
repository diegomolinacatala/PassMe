import "server-only";
import { sanitizeStoredLinks } from "@/lib/card/schema";
import { periodStart } from "@/lib/admin/days";
import type { AdminRawData, RawEvent, RawLink, RawProfile, RawUser } from "@/lib/admin/types";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database, Json, ProfileEventKind } from "@/lib/supabase/database.types";

/**
 * Raw rows for the private CRM (/crm), read with the secret key.
 * Pages are ordered by a unique key, so no row is skipped or counted twice. Each
 * part loads on its own: one failing (a pending migration, a timeout) leaves
 * it empty with a warning instead of breaking the page. Row caps keep a
 * request bounded; past them the page says the numbers are partial.
 *
 * What it never reads: push tokens, hidden links' contents, and anything about
 * the people who leave a contact or propose a meeting (only that they did).
 */

const PAGE_SIZE = 1000; // PostgREST's default max rows per response.
const MAX_ROWS = 50_000;
const MAX_USER_PAGES = 20;

/** Postgres / PostgREST codes for "that column / table doesn't exist" (migration pending). */
const MISSING_COLUMN = "42703";
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

interface Paged<T> {
  rows: T[];
  error: boolean;
  /** The database's error code, to tell a pending migration from an outage. */
  code?: string;
  truncated: boolean;
}

type AdminClient = NonNullable<ReturnType<typeof createAdminSupabase>>;

async function fetchPaged<T>(fetchPage: (from: number, to: number) => PageResult<T>): Promise<Paged<T>> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error || !data) {
      // A pending migration is expected (the caller says so on the page); anything else is worth a look.
      const pending = error?.code === MISSING_COLUMN || MISSING_TABLE_CODES.has(error?.code ?? "");
      if (!pending) log.warn("crm query failed", { from }, error);
      return { rows, error: true, code: error?.code, truncated: false };
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

async function listAuthUsers(admin: AdminClient): Promise<Paged<RawUser>> {
  const rows: RawUser[] = [];
  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) {
      log.warn("crm: listUsers failed", { page }, error);
      return { rows, error: true, truncated: false };
    }
    rows.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        provider: typeof u.app_metadata?.provider === "string" ? u.app_metadata.provider : null,
      })),
    );
    if (data.users.length < PAGE_SIZE) return { rows, error: false, truncated: false };
  }
  return { rows, error: false, truncated: true };
}

/** Visible links as stored; hidden ones keep only their kind. */
function toRawLinks(stored: Json): RawLink[] {
  return sanitizeStoredLinks(stored).map((l) =>
    l.visible
      ? { id: l.id, kind: l.kind, visible: true, label: l.label ?? "", value: l.value }
      : { id: l.id, kind: l.kind, visible: false, label: "", value: "" },
  );
}

interface EventRow {
  profile_id: string;
  kind: string;
  source: string;
  created_at: string;
  link_id: string | null;
  platform?: string | null;
  country?: string | null;
}

/** Events with device and country; without them (and flagged) while migration 20261021120000 is pending. */
async function loadEvents(admin: AdminClient, since: string, profileId: string | undefined) {
  const page = (columns: string) => (from: number, to: number) => {
    let query = admin.from("profile_events").select(columns).gte("created_at", since);
    if (profileId) query = query.eq("profile_id", profileId);
    return query.order("id").range(from, to) as unknown as PageResult<EventRow>;
  };
  const full = await fetchPaged(page("profile_id, kind, source, created_at, link_id, platform, country"));
  if (!full.error || full.code !== MISSING_COLUMN) return { result: full, pending: false };
  return { result: await fetchPaged(page("profile_id, kind, source, created_at, link_id")), pending: true };
}

export interface AdminLoadOptions {
  /** Calendar days of events to load, ending today (see periodStart). */
  days: number;
  now: Date;
  /**
   * One account's page: only their events, devices, contacts and meetings.
   * Accounts, cards and referrals always load in full (names, who brought whom).
   */
  profileId?: string;
}

const PROFILE_COLUMNS =
  "id, slug, full_name, is_published, pattern, created_at, updated_at, headline, company, location, avatar_path, bio, accent_color, typeface, links, accepts_contact_requests, accepts_meeting_requests";

type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  | "id"
  | "slug"
  | "full_name"
  | "is_published"
  | "pattern"
  | "created_at"
  | "updated_at"
  | "headline"
  | "company"
  | "location"
  | "avatar_path"
  | "bio"
  | "accent_color"
  | "typeface"
  | "links"
  | "accepts_contact_requests"
  | "accepts_meeting_requests"
>;

function toRawProfile(p: ProfileRow): RawProfile {
  return {
    id: p.id,
    slug: p.slug,
    fullName: p.full_name,
    isPublished: p.is_published,
    pattern: p.pattern,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    headline: p.headline,
    company: p.company,
    location: p.location,
    hasAvatar: Boolean(p.avatar_path),
    hasBio: p.bio.trim().length > 0,
    accentColor: p.accent_color,
    typeface: p.typeface,
    links: toRawLinks(p.links),
    acceptsContactRequests: p.accepts_contact_requests,
    acceptsMeetingRequests: p.accepts_meeting_requests,
  };
}

function toRawEvent(e: EventRow): RawEvent {
  return {
    profileId: e.profile_id,
    kind: e.kind as ProfileEventKind,
    source: e.source,
    createdAt: e.created_at,
    linkId: e.link_id,
    platform: e.platform ?? null,
    country: e.country ?? null,
  };
}

/** The heavy tables, limited to one account on its page. */
function loadActivity(admin: AdminClient, since: string, profileId: string | undefined) {
  return Promise.all([
    // Never the push tokens: only which card is on which device, and since when.
    fetchPaged<{ serial_number: string; device_library_id: string; created_at: string }>((from, to) => {
      let query = admin.from("apple_pass_registrations").select("serial_number, device_library_id, created_at");
      if (profileId) query = query.eq("serial_number", profileId);
      return query.order("device_library_id").order("serial_number").range(from, to);
    }),
    loadEvents(admin, since, profileId),
    // Counts only: the people who left their details aren't PassMe users.
    fetchPaged<{ profile_id: string; source: string; created_at: string }>((from, to) => {
      let query = admin.from("contact_requests").select("profile_id, source, created_at");
      if (profileId) query = query.eq("profile_id", profileId);
      return query.order("id").range(from, to);
    }),
    fetchPaged<{ profile_id: string; status: string; format: string; created_at: string }>((from, to) => {
      let query = admin.from("meeting_requests").select("profile_id, status, format, created_at");
      if (profileId) query = query.eq("profile_id", profileId);
      return query.order("id").range(from, to);
    }),
  ]);
}

/** Null without the secret key (demo mode): the page shows sample data instead. */
export async function loadAdminRawData({ days, now, profileId }: AdminLoadOptions): Promise<AdminRawData | null> {
  const admin = createAdminSupabase();
  if (!admin) return null;

  const since = new Date(periodStart(now, days)).toISOString();
  const [users, profiles, referrals, [registrations, events, contactRequests, meetings]] = await Promise.all([
    listAuthUsers(admin),
    fetchPaged<ProfileRow>((from, to) => admin.from("profiles").select(PROFILE_COLUMNS).order("created_at").order("id").range(from, to)),
    fetchPaged<{ profile_id: string; referrer_id: string | null; via: string; created_at: string }>((from, to) =>
      admin.from("profile_referrals").select("profile_id, referrer_id, via, created_at").order("profile_id").range(from, to),
    ),
    loadActivity(admin, since, profileId),
  ]);
  const referralsPending = referrals.error && MISSING_TABLE_CODES.has(referrals.code ?? "");
  const parts: Array<[string, Paged<unknown>]> = [
    ["los usuarios", users],
    ["las tarjetas", profiles],
    ["los pases de Apple Wallet", registrations],
    ["los eventos", events.result],
    ["los contactos recibidos", contactRequests],
    ["las reuniones", meetings],
    ...(referralsPending ? [] : ([["quién trajo a quién", referrals]] as Array<[string, Paged<unknown>]>)),
  ];
  const warnings: string[] = [];
  for (const [what, result] of parts) note(warnings, what, result);

  return {
    demo: false,
    users: users.rows,
    profiles: profiles.rows.map(toRawProfile),
    registrations: registrations.rows.map((r) => ({ serial: r.serial_number, device: r.device_library_id, createdAt: r.created_at })),
    events: events.result.rows.map(toRawEvent),
    contactRequests: contactRequests.rows.map((c) => ({ profileId: c.profile_id, source: c.source, createdAt: c.created_at })),
    meetings: meetings.rows.map((m) => ({ profileId: m.profile_id, status: m.status, format: m.format, createdAt: m.created_at })),
    referrals: referrals.rows.map((r) => ({ profileId: r.profile_id, referrerId: r.referrer_id, via: r.via, createdAt: r.created_at })),
    insightsPending: events.pending || referralsPending,
    warnings,
    failed: parts.some(([, result]) => result.error),
  };
}
