import type { ContactRequest } from "@/lib/card/contact-info";
import { DEMO_CONTACT_REQUESTS } from "@/lib/card/demo";
import { CARD_THEMES, TYPEFACES } from "@/lib/card/design";
import { PATTERN_KINDS } from "@/lib/card/pattern";
import type { ProfileEventKind } from "@/lib/supabase/database.types";
import { DAY_MS } from "./days";
import type { LeadMeeting } from "./leads";
import type { AdminRawData, RawEvent, RawLink, RawReferral } from "./types";

/**
 * Made-up sample for the CRM in demo mode (no Supabase): a small beta that
 * grows over a few weeks. Deterministic, so screenshots and E2E agree.
 */

const NAMES = [
  "Alex Rivera",
  "Lucía Martín",
  "Pablo Ortega",
  "Marta Gil",
  "Iván Soler",
  "Nora Campos",
  "Hugo Ferrer",
  "Sara Blasco",
  "Leo Navarro",
  "Carla Vidal",
  "Teo Romero",
  "Inés Lozano",
];

const COMPANIES = ["Estudio Norte", "Hotel Mirador", "Ortega Abogados", "", "Soler & Co", "Campos Foto", "", "Blasco Eventos"];
const HEADLINES = ["Product Designer", "Directora comercial", "Abogado", "Fotógrafa", "Consultor", ""];
const COUNTRIES = ["ES", "ES", "ES", "ES", "ES", "ES", "ES", "PT", "FR", "MX"];

/** Who brought whom: index of the newcomer → index of the card they came from (null: on their own). */
const REFERRALS: Record<number, { from: number | null; via: string }> = {
  3: { from: 0, via: "qr" },
  4: { from: 1, via: "qr" },
  5: { from: null, via: "direct" },
  6: { from: 0, via: "share" },
  7: { from: 1, via: "qr" },
  8: { from: null, via: "direct" },
  9: { from: 0, via: "qr" },
  10: { from: 2, via: "share" },
  11: { from: null, via: "direct" },
};

/** Mulberry32: tiny seeded PRNG. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slugOf(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function demoProfileId(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function demoLinks(slug: string, i: number): RawLink[] {
  const handle = slug.split("-")[0]!;
  const links: RawLink[] = [
    { id: `l${i}-email`, kind: "email", visible: true, label: "", value: `${handle}@example.com` },
    { id: `l${i}-linkedin`, kind: "linkedin", visible: true, label: "", value: `https://www.linkedin.com/in/${slug}-demo` },
  ];
  if (i % 2 === 0) links.push({ id: `l${i}-web`, kind: "website", visible: true, label: "Portfolio", value: "https://example.com" });
  if (i % 3 === 0) links.push({ id: `l${i}-phone`, kind: "phone", visible: false, label: "", value: "" });
  return links;
}

export function demoAdminRawData(now: Date, days: number): AdminRawData {
  const rand = random(7);
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY_MS - rand() * 8 * 3_600_000).toISOString();

  const people = NAMES.map((name, i) => ({
    id: demoProfileId(i),
    name,
    slug: slugOf(name),
    joinedDaysAgo: Math.round(70 - i * 5.5),
    popularity: 1 + ((i * 7) % 5),
  }));

  const users = people.map((p, i) => ({
    id: p.id,
    email: `${p.slug.split("-")[0]}@example.com`,
    createdAt: at(p.joinedDaysAgo),
    lastSignInAt: i % 4 === 3 ? null : at(Math.round(rand() * 20)),
    provider: i % 3 === 1 ? "google" : "email",
  }));

  const profiles = people.slice(0, -1).map((p, i) => ({
    id: p.id,
    slug: p.slug,
    fullName: p.name,
    isPublished: i !== 5,
    pattern: PATTERN_KINDS[(i * 3) % PATTERN_KINDS.length]!,
    createdAt: at(p.joinedDaysAgo),
    updatedAt: at(Math.max(0, p.joinedDaysAgo - 3 - Math.round(rand() * 10))),
    headline: HEADLINES[i % HEADLINES.length]!,
    company: COMPANIES[i % COMPANIES.length]!,
    location: i % 2 === 0 ? "Valencia, ES" : "Madrid, ES",
    hasAvatar: i % 3 !== 2,
    hasBio: i % 2 === 0,
    accentColor: CARD_THEMES[i % CARD_THEMES.length]!.background,
    typeface: TYPEFACES[i % TYPEFACES.length]!,
    links: demoLinks(p.slug, i),
    acceptsContactRequests: i % 4 !== 3,
    acceptsMeetingRequests: i % 3 === 0,
  }));

  const registrations = people.slice(0, 7).flatMap((p, i) => [
    { serial: p.id, device: `iphone-${i}`, createdAt: at(p.joinedDaysAgo - 1) },
    ...(i % 3 === 0 ? [{ serial: p.id, device: `watch-${i}`, createdAt: at(p.joinedDaysAgo - 4) }] : []),
  ]);

  const events: RawEvent[] = [];
  const visitor = () => {
    const roll = rand();
    return {
      platform: roll < 0.62 ? "ios" : roll < 0.92 ? "android" : "other",
      country: COUNTRIES[Math.floor(rand() * COUNTRIES.length)]!,
    };
  };
  const push = (profileId: string, kind: ProfileEventKind, source: string, daysAgo: number, extra: Partial<RawEvent> = {}) =>
    events.push({ profileId, kind, source, createdAt: at(daysAgo), linkId: null, platform: null, country: null, ...extra });
  for (const [i, p] of people.slice(0, -1).entries()) {
    const links = profiles[i]!.links.filter((l) => l.visible);
    for (let d = Math.min(days, p.joinedDaysAgo) - 1; d >= 0; d -= 1) {
      const views = Math.floor(rand() * (p.popularity + 1.2));
      for (let v = 0; v < views; v += 1) {
        const roll = rand();
        const source = roll < 0.55 ? "qr" : roll < 0.8 ? "share" : "direct";
        const who = visitor();
        push(p.id, "view", source, d, who);
        if (rand() < 0.38) push(p.id, "vcard", source, d, who);
        if (rand() < 0.3) push(p.id, "link_click", source, d, { ...who, linkId: links[Math.floor(rand() * links.length)]!.id });
      }
      if (rand() < 0.04) push(p.id, "pass_apple", "direct", d);
      if (rand() < 0.015) push(p.id, "pass_google", "direct", d);
    }
  }

  const contactRequests = people.slice(0, 6).flatMap((p, i) =>
    Array.from({ length: (i % 3) + 1 }, (_, k) => ({ profileId: p.id, source: k % 2 ? "share" : "qr", createdAt: at(Math.round(rand() * 40)) })),
  );
  const meeting = (index: number, status: string, format: string, daysAgo: number) => ({
    profileId: people[index]!.id,
    status,
    format,
    createdAt: at(daysAgo),
  });
  const meetings = [
    meeting(0, "confirmed", "in_person", 3),
    meeting(0, "pending", "video", 1),
    meeting(2, "declined", "phone", 12),
    meeting(4, "confirmed", "video", 22),
  ];

  const referrals: RawReferral[] = Object.entries(REFERRALS).map(([index, r]) => ({
    profileId: people[Number(index)]!.id,
    referrerId: r.from === null ? null : people[r.from]!.id,
    via: r.via,
    createdAt: users[Number(index)]!.createdAt,
  }));

  return { demo: true, users, profiles, registrations, events, contactRequests, meetings, referrals, insightsPending: false, warnings: [], failed: false };
}

/** "Mis contactos" in demo mode: people who reached out to the first sample card (Alex Rivera). */
export function demoOwnLeads(now: Date): { requests: ContactRequest[]; meetings: LeadMeeting[] } {
  const ago = (days: number, hours = 0) => new Date(now.getTime() - days * DAY_MS - hours * 3_600_000).toISOString();
  return {
    requests: [
      { ...DEMO_CONTACT_REQUESTS[0]!, createdAt: ago(2, 3) },
      {
        id: "00000000-0000-4000-8000-0000000000c2",
        name: "Jorge Peña",
        email: null,
        phone: "+34 611 222 333",
        company: "Peña Reformas",
        message: "Hablamos en el stand. Llámame cuando puedas.",
        source: "qr",
        createdAt: ago(5, 1),
      },
      {
        id: "00000000-0000-4000-8000-0000000000c3",
        name: "Elena Ruiz",
        email: "elena@example.com",
        phone: null,
        company: "",
        message: "",
        source: "share",
        createdAt: ago(11),
      },
    ],
    meetings: [
      {
        id: "00000000-0000-4000-8000-0000000000d1",
        status: "confirmed",
        format: "in_person",
        topic: "Rediseño de la web del hotel",
        source: "qr",
        createdAt: ago(1, 5),
        confirmedStart: ago(-3),
        guest: { name: "Lucía Martín", email: "lucia@example.com", phone: null, company: "Hotel Mirador" },
      },
      {
        id: "00000000-0000-4000-8000-0000000000d2",
        status: "pending",
        format: "video",
        topic: "Presupuesto de un sistema de diseño",
        source: "share",
        createdAt: ago(0, 2),
        confirmedStart: null,
        guest: { name: "Marcos Vidal", email: "marcos@example.com", phone: null, company: "Vidal Software" },
      },
    ],
  };
}
