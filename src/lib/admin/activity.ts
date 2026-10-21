import { firstParam, periodStart } from "./days";
import { cardName, countryName, linkKindLabel, MEETING_STATUS_ONE, PLATFORM_LABELS, SOURCE_LABELS } from "./labels";
import type { AdminRawData, RawEvent } from "./types";
import { signupText } from "./user-detail";

/**
 * Everything that happened, newest first (/crm/actividad): sign-ups, cards,
 * passes, visits and what visitors did. About the people who left a contact
 * or proposed a meeting it only says that it happened.
 */

export const ACTIVITY_FILTERS = {
  todo: "Todo",
  altas: "Altas y tarjetas",
  visitas: "Visitas y guardados",
  wallet: "Wallet",
  contactos: "Contactos y reuniones",
} as const;
export type ActivityFilter = keyof typeof ACTIVITY_FILTERS;

export type ActivityKind =
  | "signup"
  | "card"
  | "wallet"
  | "view"
  | "vcard"
  | "link_click"
  | "pass_apple"
  | "pass_google"
  | "contact"
  | "meeting";

const KINDS_BY_FILTER: Record<ActivityFilter, ReadonlySet<ActivityKind> | null> = {
  todo: null,
  altas: new Set(["signup", "card"]),
  visitas: new Set(["view", "vcard", "link_click"]),
  wallet: new Set(["wallet", "pass_apple", "pass_google"]),
  contactos: new Set(["contact", "meeting"]),
};

export const MAX_ACTIVITY_ITEMS = 300;

export interface ActivityItem {
  at: string;
  kind: ActivityKind;
  profileId: string;
  name: string;
  slug: string | null;
  text: string;
}

export function parseActivityFilter(value: unknown): ActivityFilter {
  const v = firstParam(value);
  return typeof v === "string" && Object.hasOwn(ACTIVITY_FILTERS, v) ? (v as ActivityFilter) : "todo";
}

/** "QR · iPhone · España": what an event says about where it came from. */
function visitDetails(e: RawEvent): string {
  return [SOURCE_LABELS[e.source], e.platform ? PLATFORM_LABELS[e.platform] : null, e.country ? countryName(e.country) : null]
    .filter(Boolean)
    .join(" · ");
}

export function buildActivity(
  raw: AdminRawData,
  { days, now, filter }: { days: number; now: Date; filter: ActivityFilter },
): { items: ActivityItem[]; total: number } {
  const since = periodStart(now, days);
  const profiles = new Map(raw.profiles.map((p) => [p.id, p]));
  const users = new Map(raw.users.map((u) => [u.id, u]));
  const referrals = new Map(raw.referrals.map((r) => [r.profileId, r]));
  const linkTitles = new Map<string, string>();
  for (const p of raw.profiles) for (const l of p.links) linkTitles.set(`${p.id}:${l.id}`, linkKindLabel(l.kind));

  const items: ActivityItem[] = [];
  const push = (at: string, kind: ActivityKind, profileId: string, text: string) => {
    if (Date.parse(at) < since) return;
    const profile = profiles.get(profileId);
    const name = profile?.fullName.trim() || users.get(profileId)?.email || cardName(undefined);
    items.push({ at, kind, profileId, name, slug: profile?.slug ?? null, text });
  };

  for (const u of raw.users) {
    const referral = referrals.get(u.id);
    const referrer = referral?.referrerId ? cardName(profiles.get(referral.referrerId)?.fullName) : null;
    push(u.createdAt, "signup", u.id, signupText(u.provider, referrer, referral?.via ?? null));
  }
  for (const p of raw.profiles) push(p.createdAt, "card", p.id, `Creó su tarjeta /u/${p.slug}`);
  for (const r of raw.registrations) push(r.createdAt, "wallet", r.serial, "Añadió su pase a Apple Wallet");
  for (const e of raw.events) {
    switch (e.kind) {
      case "view":
        push(e.createdAt, "view", e.profileId, `Visitaron su tarjeta · ${visitDetails(e)}`);
        break;
      case "vcard":
        push(e.createdAt, "vcard", e.profileId, `Alguien guardó su contacto · ${visitDetails(e)}`);
        break;
      case "link_click":
        push(e.createdAt, "link_click", e.profileId, `Pulsaron su ${linkTitles.get(`${e.profileId}:${e.linkId}`) ?? "enlace"}`);
        break;
      case "pass_apple":
        push(e.createdAt, "pass_apple", e.profileId, "Pulsó «Añadir a Apple Wallet»");
        break;
      case "pass_google":
        push(e.createdAt, "pass_google", e.profileId, "Pulsó «Añadir a Google Wallet»");
        break;
    }
  }
  for (const c of raw.contactRequests) {
    push(c.createdAt, "contact", c.profileId, `Alguien le dejó su contacto · ${SOURCE_LABELS[c.source] ?? c.source}`);
  }
  for (const m of raw.meetings) {
    push(m.createdAt, "meeting", m.profileId, `Le propusieron una reunión · ${MEETING_STATUS_ONE[m.status] ?? m.status}`);
  }

  const kinds = KINDS_BY_FILTER[filter];
  const selected = kinds ? items.filter((i) => kinds.has(i.kind)) : items;
  selected.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { items: selected.slice(0, MAX_ACTIVITY_ITEMS), total: selected.length };
}
