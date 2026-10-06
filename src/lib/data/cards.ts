import "server-only";
import { parseMeetingSettings, rulesOf } from "@/lib/meetings/settings";
import { canonicalTimeZone } from "@/lib/meetings/time";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { isValidAvatarPath } from "@/lib/card/avatar";
import { DEFAULT_ACCENT, isHexColor } from "@/lib/card/colors";
import { DEFAULT_TYPEFACE, isPatternSeed, isTypeface } from "@/lib/card/design";
import { DEFAULT_PATTERN, toPatternKind } from "@/lib/card/pattern";
import { DEMO_CARD, DEMO_SLUG } from "@/lib/card/demo";
import { quickDraftSlug, quickDraftToCardInput, type ValidQuickDraft } from "@/lib/card/quick";
import type { ValidCardInput } from "@/lib/card/schema";
import { parseCardInput, sanitizeStoredLinks } from "@/lib/card/schema";
import { checkSlug, PLACEHOLDER_SLUG_BASE, slugCandidate } from "@/lib/card/slug";
import type { OwnerCard, PublicCard } from "@/lib/card/types";
import { avatarPublicUrl, getSupabasePublicConfig } from "@/lib/env";
import { log } from "@/lib/log";
import type { Database, Json, ProfileRow } from "@/lib/supabase/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const MAX_SLUG_ATTEMPTS = 6;
const SLUG_CHANGE_LIMIT_ERROR =
  "Has cambiado tu enlace demasiadas veces. Vuelve a uno que ya usaste o escríbenos si necesitas otro.";
/** PostgREST (schema cache) and Postgres codes for "that column doesn't exist". */
const MISSING_COLUMN_CODES = new Set(["PGRST204", "42703"]);

type DesignWrite = Pick<
  Database["public"]["Tables"]["profiles"]["Update"],
  | "detail_color"
  | "pattern"
  | "pattern_seed"
  | "typeface"
  | "accepts_contact_requests"
  | "accepts_meeting_requests"
  | "time_zone"
  | "meeting_settings"
>;
type DbError = { code?: string; message?: string } | null;

/**
 * Optional fields the database can't store yet because a migration is pending:
 *   20260928120000_card_design.sql      → detail_color, pattern, pattern_seed
 *   20260928180000_pass_redesign.sql    → typeface and the new motifs
 *   20260929130000_contact_requests.sql → accepts_contact_requests
 *   20261001120000_motif_refresh.sql    → the 2026-10 motifs (arco, corriente, persiana, pliegue)
 *   20261002120000_meeting_requests.sql → accepts_meeting_requests
 *   20261006120000_owner_timezone_meeting_settings.sql → time_zone, meeting_settings
 */
function unsupportedDesignFields(error: DbError): ReadonlyArray<keyof DesignWrite> {
  if (!error?.code) return [];
  const message = error.message ?? "";
  if (MISSING_COLUMN_CODES.has(error.code)) {
    if (/time_zone|meeting_settings/.test(message)) return ["time_zone", "meeting_settings"];
    if (/accepts_contact_requests/.test(message)) return ["accepts_contact_requests"];
    if (/accepts_meeting_requests/.test(message)) return ["accepts_meeting_requests"];
    if (/detail_color|pattern/.test(message)) return ["detail_color", "pattern", "pattern_seed", "typeface"];
    if (/typeface/.test(message)) return ["typeface"];
  }
  if (error.code === CHECK_VIOLATION && /profiles_pattern_kind/.test(message)) return ["pattern"];
  return [];
}

function withoutFields(design: DesignWrite, keys: ReadonlyArray<keyof DesignWrite>): DesignWrite {
  const rest = { ...design };
  for (const key of keys) delete rest[key];
  return rest;
}

/**
 * Runs a write, and while the database rejects design fields it doesn't know
 * yet, retries without them — so sign-ups and saves keep working until the
 * migrations are applied. Everything else about the write is unchanged.
 * `dropped` lists what could not be stored, so callers can tell the owner.
 */
async function withDesignFallback<R extends { error: DbError }>(
  operation: string,
  design: DesignWrite,
  write: (design: DesignWrite) => PromiseLike<R>,
): Promise<{ result: R; dropped: ReadonlyArray<keyof DesignWrite> }> {
  let fields = design;
  let result = await write(fields);
  const dropped: Array<keyof DesignWrite> = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const unsupported = unsupportedDesignFields(result.error).filter((key) => key in fields);
    if (unsupported.length === 0) break;
    log.warn("card design migration pending: writing without some design fields", { operation, fields: unsupported.join(",") });
    dropped.push(...unsupported);
    fields = withoutFields(fields, unsupported);
    result = await write(fields);
  }
  return { result, dropped };
}

export function toPublicCard(card: OwnerCard | PublicCard): PublicCard {
  return {
    slug: card.slug,
    fullName: card.fullName,
    headline: card.headline,
    company: card.company,
    location: card.location,
    pronouns: card.pronouns,
    bio: card.bio,
    accentColor: card.accentColor,
    detailColor: card.detailColor,
    pattern: card.pattern,
    patternSeed: card.patternSeed,
    typeface: card.typeface,
    avatarUrl: card.avatarUrl,
    links: card.links.filter((l) => l.visible),
    acceptsContactRequests: card.acceptsContactRequests,
    acceptsMeetingRequests: card.acceptsMeetingRequests,
    timeZone: card.timeZone,
    meetingRules: card.meetingRules ?? null,
  };
}

/** Undefined while migration 20261006120000 is pending (the column isn't there). */
function storedTimeZone(value: unknown): string | undefined {
  return canonicalTimeZone(value) ?? undefined;
}

interface DesignColumns {
  accent_color?: string | null;
  detail_color?: string | null;
  pattern?: string | null;
  pattern_seed?: number | null;
  typeface?: string | null;
}

/**
 * Validates stored design values (defensive: rows could predate a rule change
 * or a migration). Motifs from before the redesign map to their successors.
 */
function designFromDb(row: DesignColumns): Pick<PublicCard, "accentColor" | "detailColor" | "pattern" | "patternSeed" | "typeface"> {
  return {
    accentColor: row.accent_color && isHexColor(row.accent_color) ? row.accent_color.toUpperCase() : DEFAULT_ACCENT,
    detailColor: row.detail_color && isHexColor(row.detail_color) ? row.detail_color.toUpperCase() : null,
    pattern: toPatternKind(row.pattern) ?? DEFAULT_PATTERN,
    patternSeed: isPatternSeed(row.pattern_seed) ? row.pattern_seed : 0,
    typeface: isTypeface(row.typeface) ? row.typeface : DEFAULT_TYPEFACE,
  };
}

export function rowToOwnerCard(row: ProfileRow): OwnerCard {
  return {
    id: row.id,
    slug: row.slug,
    fullName: row.full_name,
    headline: row.headline,
    company: row.company,
    location: row.location,
    pronouns: row.pronouns,
    bio: row.bio,
    ...designFromDb(row),
    avatarPath: row.avatar_path,
    avatarUrl: avatarPublicUrl(row.avatar_path),
    links: sanitizeStoredLinks(row.links),
    // Undefined until migration 20260929130000 adds the column.
    acceptsContactRequests: row.accepts_contact_requests === true,
    // Undefined until migration 20261002120000 adds the column.
    acceptsMeetingRequests: row.accepts_meeting_requests === true,
    isPublished: row.is_published,
    updatedAt: row.updated_at,
    ...ownerMeetingFields(row),
  };
}

/** Zone and meeting settings, or nothing at all while migration 20261006120000 is pending. */
function ownerMeetingFields(row: ProfileRow): Pick<OwnerCard, "timeZone" | "meetingSettings" | "meetingRules"> {
  if (row.meeting_settings === undefined) return { timeZone: storedTimeZone(row.time_zone), meetingSettings: null, meetingRules: null };
  const settings = parseMeetingSettings(row.meeting_settings);
  return { timeZone: storedTimeZone(row.time_zone), meetingSettings: settings, meetingRules: rulesOf(settings) };
}

interface PublicCardJson extends DesignColumns {
  slug?: string;
  full_name?: string;
  headline?: string;
  company?: string;
  location?: string;
  pronouns?: string;
  bio?: string;
  avatar_path?: string | null;
  accepts_contact_requests?: boolean;
  accepts_meeting_requests?: boolean;
  time_zone?: string;
  /** The settings without the private defaults (get_public_card strips them). */
  meeting_rules?: Json;
  links?: Json;
}

function jsonToPublicCard(json: PublicCardJson): PublicCard | null {
  if (!json.slug || !json.full_name) return null;
  return {
    slug: json.slug,
    fullName: json.full_name,
    headline: json.headline ?? "",
    company: json.company ?? "",
    location: json.location ?? "",
    pronouns: json.pronouns ?? "",
    bio: json.bio ?? "",
    ...designFromDb(json),
    avatarUrl: avatarPublicUrl(json.avatar_path),
    // The RPC already strips hidden links; re-validate anyway (defense in depth).
    links: sanitizeStoredLinks(json.links).filter((l) => l.visible),
    acceptsContactRequests: json.accepts_contact_requests === true,
    acceptsMeetingRequests: json.accepts_meeting_requests === true,
    timeZone: storedTimeZone(json.time_zone),
    meetingRules: json.meeting_rules === undefined ? null : rulesOf(parseMeetingSettings(json.meeting_rules)),
  };
}

/** Cookie-less client for public reads (no session needed, no RLS bypass). */
function createAnonSupabase(): TypedSupabaseClient | null {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  return createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Published card by slug. `/u/demo` always serves the built-in sample. */
export const getPublicCard = cache(async (rawSlug: string): Promise<PublicCard | null> => {
  const slug = rawSlug.toLowerCase();
  if (slug === DEMO_SLUG) return toPublicCard(DEMO_CARD);
  if (!checkSlug(slug).ok) return null;

  const supabase = createAnonSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("get_public_card", { p_slug: slug });
  if (error) {
    log.error("get_public_card failed", { slug }, error);
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return jsonToPublicCard(data as PublicCardJson);
});

/**
 * Current handle for an old one (the owner renamed their card), so printed QRs
 * keep working. Null when unknown, unpublished or the migration is pending.
 */
export const resolveSlugRedirect = cache(async (rawSlug: string): Promise<string | null> => {
  const slug = rawSlug.toLowerCase();
  if (!checkSlug(slug).ok) return null;
  const supabase = createAnonSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("resolve_slug_redirect", { p_slug: slug });
  if (error) {
    if (error.code !== "PGRST202") log.warn("resolve_slug_redirect failed", { slug }, error);
    return null;
  }
  return typeof data === "string" && data !== slug && checkSlug(data).ok ? data : null;
});

async function findOwnProfile(supabase: TypedSupabaseClient, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error(`Could not load profile: ${error.message}`);
  return data;
}

/** The signed-in user's card, or null while they have none (never creates one). */
export async function findOwnerCard(supabase: TypedSupabaseClient, userId: string): Promise<OwnerCard | null> {
  const row = await findOwnProfile(supabase, userId);
  return row ? rowToOwnerCard(row) : null;
}

export type CreateCardResult =
  | { ok: true; card: OwnerCard; /** False: the user already had a card, which was left untouched. */ created: boolean }
  | { ok: false; error: string };

const CREATE_FAILED = "No hemos podido crear tu tarjeta. Inténtalo de nuevo.";

/**
 * A first card from the quick form ("Crea la tuya"). Asks for the handle made
 * from the name ("jose-nunez") and, if it's taken, adds a short random suffix.
 * A card that already has a name is never overwritten: signing in from /crear
 * with an existing account simply leads back to it. Profiles are created here,
 * lazily, instead of by an auth trigger, so a bug in them can never block sign-ups.
 */
export async function createCardFromDraft(
  supabase: TypedSupabaseClient,
  userId: string,
  draft: ValidQuickDraft,
): Promise<CreateCardResult> {
  let current = await findOwnProfile(supabase, userId);
  if (current?.full_name) return { ok: true, card: rowToOwnerCard(current), created: false };

  const base = quickDraftSlug(draft);
  const linkSalt = randomBytes(4).toString("hex");
  let slugIndex = 0;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug =
      slugIndex === 0 && base ? base : slugCandidate(base ?? PLACEHOLDER_SLUG_BASE, randomBytes(2).toString("hex"));
    const parsed = parseCardInput(quickDraftToCardInput(draft, { slug, linkId: (i) => `l-${linkSalt}${i}` }));
    if (!parsed.ok) {
      if (parsed.errors.slug) {
        slugIndex += 1;
        continue;
      }
      log.warn("quick card failed validation", { fields: Object.keys(parsed.errors).join(",") });
      return { ok: false, error: CREATE_FAILED };
    }

    // An empty card already exists (the editor creates one on first visit): fill it in.
    if (current) {
      const saved = await saveOwnerCard(supabase, userId, parsed.data);
      if (saved.ok) return { ok: true, card: saved.card, created: true };
      if (!saved.errors.slug) return { ok: false, error: saved.errors._form ?? CREATE_FAILED };
      slugIndex += 1;
      continue;
    }

    const {
      result: { data, error },
    } = await withDesignFallback("create", designColumns(parsed.data), (fields) =>
      supabase
        .from("profiles")
        .insert({ id: userId, ...contentColumns(parsed.data), ...fields })
        .select("*")
        .single(),
    );
    if (!error && data) return { ok: true, card: rowToOwnerCard(data), created: true };
    if (error?.code !== UNIQUE_VIOLATION) {
      log.error("createCardFromDraft failed", { userId }, error);
      return { ok: false, error: CREATE_FAILED };
    }

    // Either the handle is taken or another tab created the card first.
    current = await findOwnProfile(supabase, userId);
    if (current?.full_name) return { ok: true, card: rowToOwnerCard(current), created: false };
    if (!current) slugIndex += 1;
  }
  return { ok: false, error: CREATE_FAILED };
}

/** Everything about a card but the design fields (those go through withDesignFallback). */
function contentColumns(input: ValidCardInput) {
  return {
    slug: input.slug,
    full_name: input.fullName,
    headline: input.headline,
    company: input.company,
    location: input.location,
    pronouns: input.pronouns,
    bio: input.bio,
    accent_color: input.accentColor,
    avatar_path: input.avatarPath,
    links: input.links as unknown as Json,
    is_published: input.isPublished,
  };
}

function designColumns(input: ValidCardInput): DesignWrite {
  return {
    detail_color: input.detailColor,
    pattern: input.pattern,
    pattern_seed: input.patternSeed,
    typeface: input.typeface,
    ...(input.acceptsContactRequests === undefined ? {} : { accepts_contact_requests: input.acceptsContactRequests }),
    ...(input.acceptsMeetingRequests === undefined ? {} : { accepts_meeting_requests: input.acceptsMeetingRequests }),
    ...(input.timeZone ? { time_zone: input.timeZone } : {}),
    ...(input.meetingSettings ? { meeting_settings: input.meetingSettings as unknown as Json } : {}),
  };
}

export type SaveCardResult =
  | {
      ok: true;
      card: OwnerCard;
      previousAvatarPath: string | null;
      slugChanged: boolean;
      previousSlug: string;
      /** False when the save didn't change anything (no need to update the passes). */
      changed: boolean;
      /** The database couldn't store some newer fields yet (a migration is pending). */
      designPending: boolean;
    }
  | { ok: false; errors: Record<string, string> };

export async function saveOwnerCard(
  supabase: TypedSupabaseClient,
  userId: string,
  input: ValidCardInput,
): Promise<SaveCardResult> {
  if (input.avatarPath && !isValidAvatarPath(input.avatarPath, userId)) {
    return { ok: false, errors: { avatarPath: "Imagen no válida. Vuelve a subirla." } };
  }

  const current = await findOwnProfile(supabase, userId);
  if (!current) return { ok: false, errors: { _form: "No encontramos tu tarjeta. Recarga la página." } };

  const {
    result: { data, error },
    dropped,
  } = await withDesignFallback("save", designColumns(input), (fields) =>
    supabase
      .from("profiles")
      .update({ ...contentColumns(input), ...fields })
      .eq("id", userId)
      .select("*")
      .single(),
  );

  if (error || !data) {
    if (error?.code === UNIQUE_VIOLATION) return { ok: false, errors: { slug: "Ese enlace ya está cogido." } };
    if (error?.code === CHECK_VIOLATION && /slug change limit/.test(error.message ?? "")) {
      return { ok: false, errors: { slug: SLUG_CHANGE_LIMIT_ERROR } };
    }
    log.error("saveOwnerCard failed", { userId }, error);
    return { ok: false, errors: { _form: "No hemos podido guardar. Inténtalo de nuevo." } };
  }

  return {
    ok: true,
    card: rowToOwnerCard(data),
    previousAvatarPath: current.avatar_path !== data.avatar_path ? current.avatar_path : null,
    slugChanged: current.slug !== data.slug,
    previousSlug: current.slug,
    changed: current.updated_at !== data.updated_at,
    // The zone goes with every save: missing it (migration pending) isn't news for the owner.
    designPending: dropped.some((field) => field !== "time_zone"),
  };
}

export async function isSlugAvailable(supabase: TypedSupabaseClient, slug: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_slug_available", { p_slug: slug });
  if (error) throw new Error(`is_slug_available failed: ${error.message}`);
  return data === true;
}

export interface CardStats {
  days: number;
  views: number;
  qrViews: number;
  vcardDownloads: number;
  walletAdds: number;
  linkClicks: Record<string, number>;
  dailyViews: Array<{ day: string; count: number }>;
}

export const EMPTY_STATS: CardStats = {
  days: 30,
  views: 0,
  qrViews: 0,
  vcardDownloads: 0,
  walletAdds: 0,
  linkClicks: {},
  dailyViews: [],
};

export async function getOwnStats(supabase: TypedSupabaseClient, days = 30): Promise<CardStats> {
  const { data, error } = await supabase.rpc("get_card_stats", { p_days: days });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    if (error) log.warn("get_card_stats failed", {}, error);
    return EMPTY_STATS;
  }
  const raw = data as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const clicks = raw.link_clicks && typeof raw.link_clicks === "object" ? raw.link_clicks : {};
  const daily = Array.isArray(raw.daily_views) ? raw.daily_views : [];
  return {
    days: num(raw.days) || days,
    views: num(raw.views),
    qrViews: num(raw.qr_views),
    vcardDownloads: num(raw.vcard_downloads),
    walletAdds: num(raw.wallet_adds),
    linkClicks: Object.fromEntries(Object.entries(clicks).map(([k, v]) => [k, num(v)])),
    dailyViews: daily
      .filter((d): d is { day: string; count: unknown } => typeof d === "object" && d !== null && "day" in d)
      .map((d) => ({ day: String(d.day), count: num(d.count) })),
  };
}
