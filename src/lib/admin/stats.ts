import { toPatternKind, type PatternKind } from "@/lib/card/pattern";
import type { ProfileEventKind } from "@/lib/supabase/database.types";
import { countBy, dayKey, firstParam, lastDays, mondayOf, periodStart, shiftDay } from "./days";
import { cardName, countryName, linkKindLabel, PLATFORM_LABELS } from "./labels";
import type { AdminRawData, RawEvent, RawProfile, RawUser } from "./types";
import { buildUserRows, type AdminUserRow } from "./users";

/**
 * Product-wide numbers for the CRM's summary (/crm), computed from raw rows.
 * Pure: the data layer (src/lib/data/admin-stats.ts) or the demo sample
 * (./demo.ts) supply the rows.
 */

export const ADMIN_PERIODS = [7, 30, 90] as const;
export type AdminPeriod = (typeof ADMIN_PERIODS)[number];
export const DEFAULT_ADMIN_PERIOD: AdminPeriod = 30;

const MAX_GROWTH_WEEKS = 26;
const TOP = 5;
const TOP_COUNTRIES = 8;

export interface DailyPoint {
  day: string;
  views: number;
  qr: number;
  share: number;
}

export interface WeeklyPoint {
  /** Monday of the week (YYYY-MM-DD). */
  week: string;
  signups: number;
  total: number;
}

export interface Ranked {
  key: string;
  label: string;
  count: number;
}

export interface TopCard {
  id: string;
  name: string;
  slug: string;
  views: number;
  vcards: number;
}

export interface AdminStats {
  demo: boolean;
  days: number;
  warnings: string[];
  insightsPending: boolean;
  totals: {
    users: number;
    cards: number;
    publishedCards: number;
    appleCards: number;
    /** Published cards with the pass on an Apple device (a paused card's pass stays there too). */
    publishedWithPass: number;
    appleDevices: number;
    contactRequests: number;
    meetings: number;
    meetingsConfirmed: number;
  };
  period: {
    newUsers: number;
    activeUsers: number;
    viewedCards: number;
    views: number;
    qrViews: number;
    shareViews: number;
    directViews: number;
    vcards: number;
    linkClicks: number;
    applePassTaps: number;
    googlePassTaps: number;
    contactRequests: number;
    meetings: number;
  };
  /** From account to card in the wallet and people reaching out. */
  funnel: Ranked[];
  daily: DailyPoint[];
  weekly: WeeklyPoint[];
  patterns: Array<{ pattern: PatternKind; count: number }>;
  /** Visits in the period by kind of device and country (only those recorded with one). */
  devices: Ranked[];
  /** The top countries; `recorded.countries` counts them all, for the shares. */
  countries: Ranked[];
  recorded: { devices: number; countries: number };
  /** How every account arrived. */
  origins: { qr: number; share: number; direct: number; ownWay: number; unknown: number };
  topReferrers: Ranked[];
  topCards: TopCard[];
  linkKinds: Ranked[];
  recentUsers: AdminUserRow[];
}

export function parseAdminPeriod(value: unknown): AdminPeriod {
  const n = Number(firstParam(value));
  return (ADMIN_PERIODS as readonly number[]).includes(n) ? (n as AdminPeriod) : DEFAULT_ADMIN_PERIOD;
}

/** Views per Madrid calendar day, the last `days` of them (also a user's page). */
export function dailySeries(events: RawEvent[], days: number, today: string): DailyPoint[] {
  const points = new Map<string, DailyPoint>(lastDays(today, days).map((day) => [day, { day, views: 0, qr: 0, share: 0 }]));
  for (const event of events) {
    if (event.kind !== "view") continue;
    const point = points.get(dayKey(event.createdAt));
    if (!point) continue;
    point.views += 1;
    if (event.source === "qr") point.qr += 1;
    if (event.source === "share") point.share += 1;
  }
  return [...points.values()];
}

/** Sign-ups per week since the first one (the last 26 weeks at most), with the running total. */
function weeklyGrowth(users: Array<Pick<RawUser, "createdAt">>, today: string): WeeklyPoint[] {
  if (users.length === 0) return [];
  const perWeek = countBy(users, (u) => mondayOf(dayKey(u.createdAt)));
  const firstWeek = [...perWeek.keys()].sort()[0]!;
  const lastWeek = mondayOf(today);

  const weeks: string[] = [];
  for (let week = lastWeek; week >= firstWeek && weeks.length < MAX_GROWTH_WEEKS; week = shiftDay(week, -7)) {
    weeks.unshift(week);
  }
  let total = users.filter((u) => mondayOf(dayKey(u.createdAt)) < weeks[0]!).length;
  return weeks.map((week) => {
    const signups = perWeek.get(week) ?? 0;
    total += signups;
    return { week, signups, total };
  });
}

function ranked(counts: Map<string, number>, label: (key: string) => string, limit = Infinity): Ranked[] {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: label(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"))
    .slice(0, limit);
}

/** Link id → kind, for clicks (ids are unique per card, so the card is part of the key). */
function linkKinds(profiles: RawProfile[]): Map<string, string> {
  const kinds = new Map<string, string>();
  for (const p of profiles) for (const link of p.links) kinds.set(`${p.id}:${link.id}`, link.kind);
  return kinds;
}

type Origins = AdminStats["origins"];

/**
 * How each account arrived. A referral with no referrer but a scan or a shared
 * link came from a card that was deleted since: still "from a card".
 */
function countOrigins(users: AdminUserRow[], raw: AdminRawData): Origins {
  const referralOf = new Map(raw.referrals.map((r) => [r.profileId, r]));
  const origins: Origins = { qr: 0, share: 0, direct: 0, ownWay: 0, unknown: 0 };
  for (const u of users) {
    const referral = referralOf.get(u.id);
    if (!referral) origins.unknown += 1;
    else if (referral.via === "qr" || referral.via === "share") origins[referral.via] += 1;
    else if (referral.referrerId) origins.direct += 1;
    else origins.ownWay += 1;
  }
  return origins;
}

function periodCounts(
  raw: AdminRawData,
  events: RawEvent[],
  users: AdminUserRow[],
  inPeriod: (at: string | null) => boolean,
): AdminStats["period"] {
  const count = (kind: ProfileEventKind, source?: string) =>
    events.filter((e) => e.kind === kind && (source === undefined || e.source === source)).length;
  return {
    newUsers: users.filter((u) => inPeriod(u.createdAt)).length,
    activeUsers: users.filter((u) => inPeriod(u.lastSignInAt)).length,
    viewedCards: users.filter((u) => u.views > 0).length,
    views: count("view"),
    qrViews: count("view", "qr"),
    shareViews: count("view", "share"),
    directViews: count("view", "direct"),
    vcards: count("vcard"),
    linkClicks: count("link_click"),
    applePassTaps: count("pass_apple"),
    googlePassTaps: count("pass_google"),
    contactRequests: raw.contactRequests.filter((c) => inPeriod(c.createdAt)).length,
    meetings: raw.meetings.filter((m) => inPeriod(m.createdAt)).length,
  };
}

function topCards(events: RawEvent[], profiles: Map<string, RawProfile>): TopCard[] {
  const views = countBy(events, (e) => (e.kind === "view" ? e.profileId : null));
  const vcards = countBy(events, (e) => (e.kind === "vcard" ? e.profileId : null));
  return [...views.entries()]
    .map(([id, n]) => ({
      id,
      name: cardName(profiles.get(id)?.fullName),
      slug: profiles.get(id)?.slug ?? "",
      views: n,
      vcards: vcards.get(id) ?? 0,
    }))
    .sort((a, b) => b.views - a.views || b.vcards - a.vcards)
    .slice(0, TOP);
}

/** By label: the retired "custom" kind and "website" both read "Web". */
function clickedLinkKinds(events: RawEvent[], profiles: RawProfile[]): Ranked[] {
  const kinds = linkKinds(profiles);
  const labels = countBy(events, (e) => {
    const kind = e.kind === "link_click" && e.linkId ? kinds.get(`${e.profileId}:${e.linkId}`) : undefined;
    return kind ? linkKindLabel(kind) : null;
  });
  return ranked(labels, (label) => label);
}

function sum(counts: Map<string, number>): number {
  return [...counts.values()].reduce((total, n) => total + n, 0);
}

export function buildAdminStats(raw: AdminRawData, { days, now }: { days: number; now: Date }): AdminStats {
  const today = dayKey(now);
  const since = periodStart(now, days);
  const inPeriod = (instant: string | null) => instant !== null && Date.parse(instant) >= since;
  const events = raw.events.filter((e) => inPeriod(e.createdAt));
  const users = buildUserRows({ ...raw, events }, since);
  const profiles = new Map(raw.profiles.map((p) => [p.id, p]));
  const views = events.filter((e) => e.kind === "view");
  const period = periodCounts(raw, events, users, inPeriod);
  const published = raw.profiles.filter((p) => p.isPublished).length;
  const appleCards = users.filter((u) => u.appleDevices > 0);
  const reachedOut = new Set([...raw.contactRequests.map((c) => c.profileId), ...raw.meetings.map((m) => m.profileId)]);
  const devices = countBy(views, (e) => e.platform);
  const countries = countBy(views, (e) => e.country);

  return {
    demo: raw.demo,
    days,
    warnings: raw.warnings,
    insightsPending: raw.insightsPending,
    totals: {
      users: users.length,
      cards: raw.profiles.length,
      publishedCards: published,
      appleCards: appleCards.length,
      publishedWithPass: appleCards.filter((u) => u.published).length,
      appleDevices: new Set(raw.registrations.map((r) => r.device)).size,
      contactRequests: raw.contactRequests.length,
      meetings: raw.meetings.length,
      meetingsConfirmed: raw.meetings.filter((m) => m.status === "confirmed").length,
    },
    period,
    funnel: [
      { key: "accounts", label: "Cuentas", count: users.length },
      { key: "cards", label: "Con tarjeta", count: raw.profiles.length },
      { key: "published", label: "Tarjeta publicada", count: published },
      { key: "wallet", label: "Pase en Apple Wallet", count: appleCards.length },
      { key: "viewed", label: `Con visitas en ${days} días`, count: period.viewedCards },
      { key: "reached", label: "Les han dejado contacto o reunión", count: reachedOut.size },
    ],
    daily: dailySeries(events, days, today),
    weekly: weeklyGrowth(users, today),
    patterns: ranked(
      countBy(raw.profiles, (p) => toPatternKind(p.pattern)),
      (key) => key,
    ).map((r) => ({ pattern: r.key as PatternKind, count: r.count })),
    devices: ranked(devices, (key) => PLATFORM_LABELS[key] ?? key),
    countries: ranked(countries, countryName, TOP_COUNTRIES),
    recorded: { devices: sum(devices), countries: sum(countries) },
    origins: countOrigins(users, raw),
    topReferrers: ranked(
      countBy(raw.referrals, (r) => r.referrerId),
      (id) => cardName(profiles.get(id)?.fullName),
      TOP,
    ),
    topCards: topCards(events, profiles),
    linkKinds: clickedLinkKinds(events, raw.profiles),
    recentUsers: users.slice(0, TOP),
  };
}
