import "server-only";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { isValidAvatarPath } from "@/lib/card/avatar";
import { DEFAULT_ACCENT, isHexColor } from "@/lib/card/colors";
import { DEFAULT_DETAIL, DEFAULT_TYPEFACE, isPatternSeed, isTypeface, randomPatternSeed } from "@/lib/card/design";
import { DEFAULT_PATTERN, toPatternKind } from "@/lib/card/pattern";
import { DEMO_CARD, DEMO_SLUG } from "@/lib/card/demo";
import type { ValidCardInput } from "@/lib/card/schema";
import { sanitizeStoredLinks } from "@/lib/card/schema";
import { checkSlug, slugCandidate } from "@/lib/card/slug";
import type { OwnerCard, PublicCard } from "@/lib/card/types";
import { avatarPublicUrl, getSupabasePublicConfig } from "@/lib/env";
import { log } from "@/lib/log";
import type { Database, Json, ProfileRow } from "@/lib/supabase/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const MAX_SLUG_ATTEMPTS = 6;
/** PostgREST (schema cache) and Postgres codes for "that column doesn't exist". */
const MISSING_COLUMN_CODES = new Set(["PGRST204", "42703"]);

type DesignWrite = Pick<Database["public"]["Tables"]["profiles"]["Update"], "detail_color" | "pattern" | "pattern_seed" | "typeface">;
type DbError = { code?: string; message?: string } | null;

/**
 * Design fields the database can't store yet because a migration is pending:
 *   20260928120000_card_design.sql  → detail_color, pattern, pattern_seed
 *   20260928180000_pass_redesign.sql → typeface and the new motifs
 */
function unsupportedDesignFields(error: DbError): ReadonlyArray<keyof DesignWrite> {
  if (!error?.code) return [];
  const message = error.message ?? "";
  if (MISSING_COLUMN_CODES.has(error.code)) {
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
  };
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
    isPublished: row.is_published,
    updatedAt: row.updated_at,
  };
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

async function findOwnProfile(supabase: TypedSupabaseClient, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error(`Could not load profile: ${error.message}`);
  return data;
}

/**
 * Loads the signed-in user's card, creating an empty draft on first visit.
 * Profiles are created lazily (instead of an auth trigger) so a bug here can
 * never block sign-ups.
 */
export async function getOrCreateOwnerCard(
  supabase: TypedSupabaseClient,
  user: { id: string; email: string | null },
): Promise<OwnerCard> {
  const existing = await findOwnProfile(supabase, user.id);
  if (existing) return rowToOwnerCard(existing);

  const design: DesignWrite = {
    detail_color: DEFAULT_DETAIL,
    pattern: DEFAULT_PATTERN,
    pattern_seed: randomPatternSeed(),
    typeface: DEFAULT_TYPEFACE,
  };

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = slugCandidate(user.email ?? "", randomBytes(3).toString("hex"));
    // New cards simply start with the column defaults if some design fields can't be stored yet.
    const {
      result: { data, error },
    } = await withDesignFallback("create", design, (fields) =>
      supabase
        .from("profiles")
        .insert({ id: user.id, slug, accent_color: DEFAULT_ACCENT, ...fields })
        .select("*")
        .single(),
    );

    if (!error && data) return rowToOwnerCard(data);
    if (error?.code !== UNIQUE_VIOLATION) throw new Error(`Could not create profile: ${error?.message}`);

    // Either the slug collided or a parallel request created the row first.
    const raced = await findOwnProfile(supabase, user.id);
    if (raced) return rowToOwnerCard(raced);
  }
  throw new Error("Could not generate a unique slug");
}

export type SaveCardResult =
  | {
      ok: true;
      card: OwnerCard;
      previousAvatarPath: string | null;
      slugChanged: boolean;
      previousSlug: string;
      /** The database couldn't store part of the design yet (a migration is pending). */
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

  const content = {
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
  const design: DesignWrite = {
    detail_color: input.detailColor,
    pattern: input.pattern,
    pattern_seed: input.patternSeed,
    typeface: input.typeface,
  };
  const {
    result: { data, error },
    dropped,
  } = await withDesignFallback("save", design, (fields) =>
    supabase
      .from("profiles")
      .update({ ...content, ...fields })
      .eq("id", userId)
      .select("*")
      .single(),
  );

  if (error || !data) {
    if (error?.code === UNIQUE_VIOLATION) return { ok: false, errors: { slug: "Ese enlace ya está cogido." } };
    log.error("saveOwnerCard failed", { userId }, error);
    return { ok: false, errors: { _form: "No hemos podido guardar. Inténtalo de nuevo." } };
  }

  return {
    ok: true,
    card: rowToOwnerCard(data),
    previousAvatarPath: current.avatar_path !== data.avatar_path ? current.avatar_path : null,
    slugChanged: current.slug !== data.slug,
    previousSlug: current.slug,
    designPending: dropped.length > 0,
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
