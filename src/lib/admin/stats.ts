import { toPatternKind, type PatternKind } from "@/lib/card/pattern";
import type { ProfileEventKind } from "@/lib/supabase/database.types";
import { ADMIN_TIME_ZONE } from "./format";

/**
 * Product-wide numbers for the private dashboard (/admin), computed from raw
 * rows. Pure: the data layer (src/lib/data/admin-stats.ts) or the demo sample
 * (./demo.ts) supply the rows.
 */

export const ADMIN_PERIODS = [7, 30, 90] as const;
export type AdminPeriod = (typeof ADMIN_PERIODS)[number];
export const DEFAULT_ADMIN_PERIOD: AdminPeriod = 30;

const MAX_GROWTH_WEEKS = 26;
const DAY_MS = 86_400_000;

export interface RawUser {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

export interface RawProfile {
  id: string;
  slug: string;
  fullName: string;
  isPublished: boolean;
  pattern: string;
  createdAt: string;
}

export interface RawRegistration {
  serial: string;
  device: string;
}

export interface RawEvent {
  profileId: string;
  kind: ProfileEventKind;
  source: string;
  createdAt: string;
}

export interface RawContactRequest {
  profileId: string;
  createdAt: string;
}

export interface RawMeeting {
  profileId: string;
  status: string;
  createdAt: string;
}

export interface AdminRawData {
  demo: boolean;
  users: RawUser[];
  profiles: RawProfile[];
  registrations: RawRegistration[];
  /** Only the selected period. */
  events: RawEvent[];
  contactRequests: RawContactRequest[];
  meetings: RawMeeting[];
  /** What couldn't be loaded or was cut short, for a notice on the page. */
  warnings: string[];
}

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

export interface AdminUserRow {
  id: string;
  name: string;
  slug: string | null;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  published: boolean;
  pattern: PatternKind | null;
  appleDevices: number;
  views: number;
  vcards: number;
  contactRequests: number;
  meetings: number;
}

export interface AdminStats {
  demo: boolean;
  days: number;
  warnings: string[];
  totals: {
    users: number;
    cards: number;
    publishedCards: number;
    appleCards: number;
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
  daily: DailyPoint[];
  weekly: WeeklyPoint[];
  patterns: Array<{ pattern: PatternKind; count: number }>;
  users: AdminUserRow[];
}

export function parseAdminPeriod(value: unknown): AdminPeriod {
  const n = Number(value);
  return (ADMIN_PERIODS as readonly number[]).includes(n) ? (n as AdminPeriod) : DEFAULT_ADMIN_PERIOD;
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ADMIN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD of an instant, in Madrid. */
export function dayKey(instant: string | Date): string {
  return dayFormatter.format(typeof instant === "string" ? new Date(instant) : instant);
}

function shiftDay(day: string, offset: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + offset)).toISOString().slice(0, 10);
}

function mondayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

function countBy<T>(rows: T[], key: (row: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function dailySeries(events: RawEvent[], days: number, today: string): DailyPoint[] {
  const points = new Map<string, DailyPoint>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = shiftDay(today, -i);
    points.set(day, { day, views: 0, qr: 0, share: 0 });
  }
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
function weeklyGrowth(users: RawUser[], today: string): WeeklyPoint[] {
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

function userRows(raw: AdminRawData, since: number): AdminUserRow[] {
  const profiles = new Map(raw.profiles.map((p) => [p.id, p]));
  const devices = countBy(raw.registrations, (r) => r.serial);
  const views = countBy(raw.events, (e) => (e.kind === "view" ? e.profileId : null));
  const vcards = countBy(raw.events, (e) => (e.kind === "vcard" ? e.profileId : null));
  const inPeriod = (createdAt: string) => Date.parse(createdAt) >= since;
  const contacts = countBy(raw.contactRequests, (c) => (inPeriod(c.createdAt) ? c.profileId : null));
  const meetings = countBy(raw.meetings, (m) => (inPeriod(m.createdAt) ? m.profileId : null));

  // Auth users are the source of truth; a card whose user isn't listed (listing failed) still shows up.
  const users: RawUser[] = [...raw.users];
  const known = new Set(users.map((u) => u.id));
  for (const p of raw.profiles) {
    if (!known.has(p.id)) users.push({ id: p.id, email: null, createdAt: p.createdAt, lastSignInAt: null });
  }

  return users
    .map((user) => {
      const profile = profiles.get(user.id);
      return {
        id: user.id,
        name: profile?.fullName.trim() || "",
        slug: profile?.slug ?? null,
        email: user.email,
        createdAt: user.createdAt,
        lastSignInAt: user.lastSignInAt,
        published: profile?.isPublished ?? false,
        pattern: profile ? toPatternKind(profile.pattern) : null,
        appleDevices: devices.get(user.id) ?? 0,
        views: views.get(user.id) ?? 0,
        vcards: vcards.get(user.id) ?? 0,
        contactRequests: contacts.get(user.id) ?? 0,
        meetings: meetings.get(user.id) ?? 0,
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function buildAdminStats(raw: AdminRawData, { days, now }: { days: number; now: Date }): AdminStats {
  const today = dayKey(now);
  const since = now.getTime() - days * DAY_MS;
  const inPeriod = (instant: string | null) => instant !== null && Date.parse(instant) >= since;
  const events = raw.events.filter((e) => inPeriod(e.createdAt));
  const count = (kind: ProfileEventKind, source?: string) =>
    events.filter((e) => e.kind === kind && (source === undefined || e.source === source)).length;
  const users = userRows({ ...raw, events }, since);

  const patterns = countBy(raw.profiles, (p) => toPatternKind(p.pattern));

  return {
    demo: raw.demo,
    days,
    warnings: raw.warnings,
    totals: {
      users: users.length,
      cards: raw.profiles.length,
      publishedCards: raw.profiles.filter((p) => p.isPublished).length,
      appleCards: new Set(raw.registrations.map((r) => r.serial)).size,
      appleDevices: new Set(raw.registrations.map((r) => r.device)).size,
      contactRequests: raw.contactRequests.length,
      meetings: raw.meetings.length,
      meetingsConfirmed: raw.meetings.filter((m) => m.status === "confirmed").length,
    },
    period: {
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
    },
    daily: dailySeries(events, days, today),
    weekly: weeklyGrowth(users, today),
    patterns: [...patterns.entries()]
      .map(([pattern, n]) => ({ pattern: pattern as PatternKind, count: n }))
      .sort((a, b) => b.count - a.count),
    users,
  };
}
