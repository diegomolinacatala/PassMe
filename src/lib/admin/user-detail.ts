import { isLinkKind, linkDisplay, linkTitle } from "@/lib/card/links";
import { countBy, dayKey, latest, periodStart } from "./days";
import {
  cardName,
  countryName,
  linkKindLabel,
  MEETING_FORMAT_LABELS,
  MEETING_STATUS_LABELS,
  MEETING_STATUS_ONE,
  PLATFORM_LABELS,
  providerLabel,
  SOURCE_LABELS,
  VIA_LABELS,
} from "./labels";
import { dailySeries, type DailyPoint, type Ranked } from "./stats";
import type { AdminRawData, RawProfile } from "./types";
import { buildUserRows, type AdminUserRow } from "./users";

/**
 * One account's page in the CRM (/crm/usuarios/[id]). `raw` holds everyone's
 * accounts, cards and referrals, but only this person's events, devices,
 * contacts and meetings (see loadAdminRawData's `profileId`).
 */

export const USER_DETAIL_DAYS = 90;
const MAX_TIMELINE = 40;

export interface DetailLink {
  id: string;
  kind: string;
  /** Title and value only for visible links: hidden ones stay private, even here. */
  title: string;
  value: string;
  visible: boolean;
  clicks: number;
}

export interface TimelineItem {
  at: string;
  text: string;
}

export interface AdminUserDetail {
  row: AdminUserRow;
  profile: RawProfile | null;
  referredUsers: Array<{ id: string; name: string; slug: string | null; createdAt: string; via: string }>;
  /** When each Apple device that has the pass now added it, oldest first. */
  devicesAddedAt: string[];
  days: number;
  daily: DailyPoint[];
  activity: { views: number; qr: number; share: number; direct: number; vcards: number; clicks: number; appleTaps: number; googleTaps: number };
  platforms: Ranked[];
  countries: Ranked[];
  vcardPlatforms: Ranked[];
  links: DetailLink[];
  contacts: { total: number; bySource: Ranked[]; last: string | null };
  meetings: { total: number; byStatus: Ranked[]; byFormat: Ranked[]; last: string | null };
  timeline: TimelineItem[];
}

function ranked(counts: Map<string, number>, labels: Record<string, string> | ((key: string) => string)): Ranked[] {
  const label = typeof labels === "function" ? labels : (key: string) => labels[key] ?? key;
  return [...counts.entries()].map(([key, count]) => ({ key, label: label(key), count })).sort((a, b) => b.count - a.count);
}

/** Null when there's no such account (nor a card with that id). */
export function buildUserDetail(raw: AdminRawData, id: string, now: Date): AdminUserDetail | null {
  const since = periodStart(now, USER_DETAIL_DAYS);
  const row = buildUserRows(raw, since).find((r) => r.id === id);
  if (!row) return null;

  const profiles = new Map(raw.profiles.map((p) => [p.id, p]));
  const profile = profiles.get(id) ?? null;
  const events = raw.events.filter((e) => e.profileId === id && Date.parse(e.createdAt) >= since);
  const views = events.filter((e) => e.kind === "view");
  const vcards = events.filter((e) => e.kind === "vcard");
  const kindCount = (kind: string) => events.filter((e) => e.kind === kind).length;
  const contacts = raw.contactRequests.filter((c) => c.profileId === id);
  const meetings = raw.meetings.filter((m) => m.profileId === id);
  const registrations = raw.registrations.filter((r) => r.serial === id);
  const referredUsers = raw.referrals
    .filter((r) => r.referrerId === id)
    .map((r) => ({
      id: r.profileId,
      name: cardName(profiles.get(r.profileId)?.fullName),
      slug: profiles.get(r.profileId)?.slug ?? null,
      createdAt: r.createdAt,
      via: r.via,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const clicks = countBy(events, (e) => (e.kind === "link_click" ? e.linkId : null));
  const links: DetailLink[] = (profile?.links ?? []).map((link) => {
    const kind = isLinkKind(link.kind) ? link.kind : null;
    return {
      id: link.id,
      kind: link.kind,
      title: link.visible && kind ? linkTitle({ kind, label: link.label, value: link.value }) : linkKindLabel(link.kind),
      value: link.visible && kind ? linkDisplay(kind, link.value) : "",
      visible: link.visible,
      clicks: clicks.get(link.id) ?? 0,
    };
  });

  return {
    row,
    profile,
    referredUsers,
    devicesAddedAt: registrations.map((r) => r.createdAt).sort((a, b) => Date.parse(a) - Date.parse(b)),
    days: USER_DETAIL_DAYS,
    daily: dailySeries(events, USER_DETAIL_DAYS, dayKey(now)),
    activity: {
      views: views.length,
      qr: views.filter((e) => e.source === "qr").length,
      share: views.filter((e) => e.source === "share").length,
      direct: views.filter((e) => e.source === "direct").length,
      vcards: vcards.length,
      clicks: kindCount("link_click"),
      appleTaps: kindCount("pass_apple"),
      googleTaps: kindCount("pass_google"),
    },
    platforms: ranked(countBy(views, (e) => e.platform), PLATFORM_LABELS),
    countries: ranked(countBy(views, (e) => e.country), countryName),
    vcardPlatforms: ranked(countBy(vcards, (e) => e.platform), PLATFORM_LABELS),
    links,
    contacts: {
      total: contacts.length,
      bySource: ranked(countBy(contacts, (c) => c.source), SOURCE_LABELS),
      last: latest(contacts.map((c) => c.createdAt)),
    },
    meetings: {
      total: meetings.length,
      byStatus: ranked(countBy(meetings, (m) => m.status), MEETING_STATUS_LABELS),
      byFormat: ranked(countBy(meetings, (m) => m.format), MEETING_FORMAT_LABELS),
      last: latest(meetings.map((m) => m.createdAt)),
    },
    timeline: buildTimeline(raw, row, profile, registrations, referredUsers),
  };
}

/** "Se dio de alta con Google, desde la tarjeta de Ana, escaneando el QR". */
export function signupText(provider: string | null, referrer: string | null, via: string | null): string {
  const how = provider && provider !== "email" ? ` con ${providerLabel(provider)}` : "";
  const from = referrer ? `, desde la tarjeta de ${referrer}, ${VIA_LABELS[via ?? "direct"] ?? ""}` : "";
  return `Se dio de alta${how}${from}`;
}

/** Sign-up, card and devices always show; the rest (newest first) fills up to MAX_TIMELINE. */
function buildTimeline(
  raw: AdminRawData,
  row: AdminUserRow,
  profile: RawProfile | null,
  registrations: AdminRawData["registrations"],
  referredUsers: AdminUserDetail["referredUsers"],
): TimelineItem[] {
  const milestones: TimelineItem[] = [{ at: row.createdAt, text: signupText(row.provider, row.referrer?.name ?? null, row.via) }];
  if (profile) milestones.push({ at: profile.createdAt, text: `Creó su tarjeta /u/${profile.slug}` });
  for (const r of registrations) milestones.push({ at: r.createdAt, text: "Añadió su pase a un dispositivo Apple" });

  const others: TimelineItem[] = [];
  if (row.lastSignInAt) others.push({ at: row.lastSignInAt, text: "Último acceso a su cuenta" });
  if (profile && Date.parse(profile.updatedAt) - Date.parse(profile.createdAt) > 60_000) {
    others.push({ at: profile.updatedAt, text: "Última vez que guardó cambios en su tarjeta" });
  }
  for (const r of referredUsers) others.push({ at: r.createdAt, text: `${r.name} creó su tarjeta desde la suya` });
  for (const c of raw.contactRequests.filter((c) => c.profileId === row.id)) {
    others.push({ at: c.createdAt, text: `Alguien le dejó su contacto (${SOURCE_LABELS[c.source] ?? c.source})` });
  }
  for (const m of raw.meetings.filter((m) => m.profileId === row.id)) {
    others.push({ at: m.createdAt, text: `Le propusieron una reunión (${MEETING_STATUS_ONE[m.status] ?? m.status})` });
  }
  const newestFirst = (a: TimelineItem, b: TimelineItem) => Date.parse(b.at) - Date.parse(a.at);
  const room = Math.max(0, MAX_TIMELINE - milestones.length);
  return [...milestones, ...others.sort(newestFirst).slice(0, room)].sort(newestFirst);
}
