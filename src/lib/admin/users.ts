import { toPatternKind, type PatternKind } from "@/lib/card/pattern";
import { csvCell, csvFile } from "@/lib/csv";
import { countBy, DAY_MS, earliest, firstParam } from "./days";
import { formatSortableDateTime } from "./format";
import { cardName, providerLabel, VIA_LABELS } from "./labels";
import type { AdminRawData, RawUser } from "./types";

/**
 * One row per PassMe account for the CRM's user list, its filters and its
 * spreadsheet export. Activity counts cover the events in `raw` (the selected
 * period); contacts and meetings are filtered to the same period here.
 */

export interface ReferrerRef {
  id: string;
  name: string;
  slug: string | null;
}

export interface AdminUserRow {
  id: string;
  name: string;
  slug: string | null;
  email: string | null;
  provider: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  cardUpdatedAt: string | null;
  published: boolean;
  pattern: PatternKind | null;
  headline: string;
  company: string;
  appleDevices: number;
  /** When the card first reached an Apple device that still has it. */
  walletSince: string | null;
  views: number;
  qrViews: number;
  vcards: number;
  linkClicks: number;
  /** Taps on «Añadir a Apple Wallet» / «Añadir a Google Wallet» (the owner's own). */
  applePassTaps: number;
  googlePassTaps: number;
  lastViewAt: string | null;
  contactRequests: number;
  meetings: number;
  /** Whether a referral row exists (cards created before migration 20261021120000 have none). */
  referralKnown: boolean;
  /** Null on their own, or when the referrer deleted their account (then `via` still says how). */
  referrer: ReferrerRef | null;
  /** How they reached a card ("qr", "share", "direct"); null when they came on their own. */
  via: string | null;
  /** Cards created from this person's card, ever. */
  referred: number;
}

export function buildUserRows(raw: AdminRawData, since: number): AdminUserRow[] {
  const profiles = new Map(raw.profiles.map((p) => [p.id, p]));
  const devices = countBy(raw.registrations, (r) => r.serial);
  const inPeriod = (createdAt: string) => Date.parse(createdAt) >= since;
  const events = raw.events.filter((e) => inPeriod(e.createdAt));
  const byKind = (kind: string, extra?: (source: string) => boolean) =>
    countBy(events, (e) => (e.kind === kind && (!extra || extra(e.source)) ? e.profileId : null));
  const views = byKind("view");
  const qrViews = byKind("view", (s) => s === "qr");
  const vcards = byKind("vcard");
  const clicks = byKind("link_click");
  const appleTaps = byKind("pass_apple");
  const googleTaps = byKind("pass_google");
  const contacts = countBy(raw.contactRequests, (c) => (inPeriod(c.createdAt) ? c.profileId : null));
  const meetings = countBy(raw.meetings, (m) => (inPeriod(m.createdAt) ? m.profileId : null));
  const referrals = new Map(raw.referrals.map((r) => [r.profileId, r]));
  const referred = countBy(raw.referrals, (r) => r.referrerId);

  const lastView = new Map<string, string>();
  for (const e of events) {
    if (e.kind !== "view") continue;
    const current = lastView.get(e.profileId);
    if (!current || Date.parse(e.createdAt) > Date.parse(current)) lastView.set(e.profileId, e.createdAt);
  }
  const walletSince = new Map<string, string | null>();
  for (const r of raw.registrations) walletSince.set(r.serial, earliest([walletSince.get(r.serial) ?? null, r.createdAt]));

  // Auth users are the source of truth; a card whose user isn't listed (listing failed) still shows up.
  const users: RawUser[] = [...raw.users];
  const known = new Set(users.map((u) => u.id));
  for (const p of raw.profiles) {
    if (!known.has(p.id)) users.push({ id: p.id, email: null, createdAt: p.createdAt, lastSignInAt: null, provider: null });
  }

  const ref = (id: string | null): ReferrerRef | null => {
    if (!id) return null;
    const p = profiles.get(id);
    return { id, name: cardName(p?.fullName), slug: p?.slug ?? null };
  };

  return users
    .map((user): AdminUserRow => {
      const profile = profiles.get(user.id);
      const referral = referrals.get(user.id);
      return {
        id: user.id,
        name: profile?.fullName.trim() || "",
        slug: profile?.slug ?? null,
        email: user.email,
        provider: user.provider,
        createdAt: user.createdAt,
        lastSignInAt: user.lastSignInAt,
        cardUpdatedAt: profile?.updatedAt ?? null,
        published: profile?.isPublished ?? false,
        pattern: profile ? toPatternKind(profile.pattern) : null,
        headline: profile?.headline ?? "",
        company: profile?.company ?? "",
        appleDevices: devices.get(user.id) ?? 0,
        walletSince: walletSince.get(user.id) ?? null,
        views: views.get(user.id) ?? 0,
        qrViews: qrViews.get(user.id) ?? 0,
        vcards: vcards.get(user.id) ?? 0,
        linkClicks: clicks.get(user.id) ?? 0,
        applePassTaps: appleTaps.get(user.id) ?? 0,
        googlePassTaps: googleTaps.get(user.id) ?? 0,
        lastViewAt: lastView.get(user.id) ?? null,
        contactRequests: contacts.get(user.id) ?? 0,
        meetings: meetings.get(user.id) ?? 0,
        referralKnown: referral !== undefined,
        referrer: ref(referral?.referrerId ?? null),
        via: referral && (referral.referrerId || referral.via !== "direct") ? referral.via : null,
        referred: referred.get(user.id) ?? 0,
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

// ---------------------------------------------------------------------------
// Filters, order and search (all from the URL: ?f=…&orden=…&q=…)
// ---------------------------------------------------------------------------

/** Not signed in for this long: "dormant". */
export const DORMANT_DAYS = 30;

export const USER_FILTERS = {
  todos: "Todos",
  publicadas: "Con tarjeta publicada",
  wallet: "Con el pase en Apple Wallet",
  "sin-wallet": "Publicada, sin pase",
  "sin-tarjeta": "Sin tarjeta",
  dormidos: `Sin entrar en ${DORMANT_DAYS} días`,
} as const;
export type UserFilter = keyof typeof USER_FILTERS;

export const USER_SORTS = {
  alta: "Alta más reciente",
  acceso: "Último acceso",
  visitas: "Más visitas",
  guardados: "Más guardados",
  contactos: "Más contactos",
  trajo: "Más gente traída",
  nombre: "Nombre",
} as const;
export type UserSort = keyof typeof USER_SORTS;

export const MAX_SEARCH_LENGTH = 80;

export interface UserListQuery {
  filter: UserFilter;
  sort: UserSort;
  search: string;
}

export function parseUserListQuery(params: Record<string, unknown>): UserListQuery {
  const f = firstParam(params.f);
  const sort = firstParam(params.orden);
  const q = firstParam(params.q);
  return {
    filter: typeof f === "string" && Object.hasOwn(USER_FILTERS, f) ? (f as UserFilter) : "todos",
    sort: typeof sort === "string" && Object.hasOwn(USER_SORTS, sort) ? (sort as UserSort) : "alta",
    search: typeof q === "string" ? q.trim().slice(0, MAX_SEARCH_LENGTH) : "",
  };
}

/** Lowercase, no accents: "Lucía" matches "lucia". */
function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

function matchesFilter(row: AdminUserRow, filter: UserFilter, now: number): boolean {
  switch (filter) {
    case "publicadas":
      return row.published;
    case "wallet":
      return row.appleDevices > 0;
    case "sin-wallet":
      return row.published && row.appleDevices === 0;
    case "sin-tarjeta":
      return row.slug === null;
    case "dormidos":
      return row.lastSignInAt === null || now - Date.parse(row.lastSignInAt) > DORMANT_DAYS * DAY_MS;
    default:
      return true;
  }
}

const byNumber = (pick: (row: AdminUserRow) => number) => (a: AdminUserRow, b: AdminUserRow) => pick(b) - pick(a);
const byInstant = (pick: (row: AdminUserRow) => string | null) => (a: AdminUserRow, b: AdminUserRow) =>
  (pick(b) ? Date.parse(pick(b)!) : 0) - (pick(a) ? Date.parse(pick(a)!) : 0);

const SORTERS: Record<UserSort, (a: AdminUserRow, b: AdminUserRow) => number> = {
  alta: byInstant((r) => r.createdAt),
  acceso: byInstant((r) => r.lastSignInAt),
  visitas: byNumber((r) => r.views),
  guardados: byNumber((r) => r.vcards),
  contactos: byNumber((r) => r.contactRequests + r.meetings),
  trajo: byNumber((r) => r.referred),
  // Nameless accounts (no card yet) go last.
  nombre: (a, b) => Number(!a.name) - Number(!b.name) || a.name.localeCompare(b.name, "es"),
};

/** A new, filtered and ordered list; ties keep the newest sign-up first. */
export function selectUsers(rows: readonly AdminUserRow[], query: UserListQuery, now: number): AdminUserRow[] {
  const needle = fold(query.search);
  const tieBreak = SORTERS.alta;
  return rows
    .filter((row) => matchesFilter(row, query.filter, now))
    .filter((row) => !needle || [row.name, row.email ?? "", row.slug ?? "", row.company].some((v) => fold(v).includes(needle)))
    .sort((a, b) => SORTERS[query.sort](a, b) || tieBreak(a, b));
}

// ---------------------------------------------------------------------------
// Spreadsheet
// ---------------------------------------------------------------------------

function cardStatus(row: AdminUserRow): string {
  if (!row.slug) return "Sin tarjeta";
  return row.published ? "Publicada" : "Oculta";
}

function origin(row: AdminUserRow): string {
  if (!row.referralKnown) return "";
  if (!row.referrer) return row.via ? `Una tarjeta ya borrada, ${VIA_LABELS[row.via] ?? ""}` : "Por su cuenta";
  return `${row.referrer.name}${row.referrer.slug ? ` (/u/${row.referrer.slug})` : ""}, ${VIA_LABELS[row.via ?? "direct"] ?? ""}`;
}

/** The user list as a spreadsheet; activity columns cover the last `days` days. */
export function usersToCsv(rows: readonly AdminUserRow[], days: number, siteUrl: string): string {
  const header = [
    "Nombre",
    "Email",
    "Tarjeta",
    "Enlace",
    "Cargo",
    "Empresa",
    "Alta",
    "Último acceso",
    "Entra con",
    "Apple Wallet (dispositivos)",
    "En Apple Wallet desde",
    `Visitas (${days} días)`,
    `Escaneos del QR (${days} días)`,
    `Guardaron el contacto (${days} días)`,
    `Clics en enlaces (${days} días)`,
    `Contactos recibidos (${days} días)`,
    `Reuniones propuestas (${days} días)`,
    "Llegó desde",
    "Ha traído",
  ];
  const num = (n: number) => csvCell(String(n));
  return csvFile(
    header,
    rows.map((r) => [
      csvCell(r.name),
      csvCell(r.email ?? ""),
      csvCell(cardStatus(r)),
      csvCell(r.slug ? `${siteUrl}/u/${r.slug}` : ""),
      csvCell(r.headline),
      csvCell(r.company),
      csvCell(formatSortableDateTime(r.createdAt)),
      csvCell(formatSortableDateTime(r.lastSignInAt)),
      csvCell(r.provider ? providerLabel(r.provider) : ""),
      num(r.appleDevices),
      csvCell(formatSortableDateTime(r.walletSince)),
      num(r.views),
      num(r.qrViews),
      num(r.vcards),
      num(r.linkClicks),
      num(r.contactRequests),
      num(r.meetings),
      csvCell(origin(r)),
      num(r.referred),
    ]),
  );
}
