import { PATTERN_KINDS } from "@/lib/card/pattern";
import type { ProfileEventKind } from "@/lib/supabase/database.types";
import type { AdminRawData, RawEvent } from "./stats";

/**
 * Made-up sample for the dashboard in demo mode (no Supabase): a small beta
 * that grows over a few weeks. Deterministic, so screenshots and E2E agree.
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

const DAY_MS = 86_400_000;

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

export function demoAdminRawData(now: Date, days: number): AdminRawData {
  const rand = random(7);
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY_MS - rand() * 8 * 3_600_000).toISOString();

  const people = NAMES.map((name, i) => {
    const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const joinedDaysAgo = Math.round(70 - i * 5.5);
    return { id, name, joinedDaysAgo, popularity: 1 + ((i * 7) % 5) };
  });

  const users = people.map((p, i) => ({
    id: p.id,
    email: `${slugOf(p.name).split("-")[0]}@example.com`,
    createdAt: at(p.joinedDaysAgo),
    lastSignInAt: i % 4 === 3 ? null : at(Math.round(rand() * 20)),
  }));

  const profiles = people.slice(0, -1).map((p, i) => ({
    id: p.id,
    slug: slugOf(p.name),
    fullName: p.name,
    isPublished: i !== 5,
    pattern: PATTERN_KINDS[(i * 3) % PATTERN_KINDS.length]!,
    createdAt: at(p.joinedDaysAgo),
  }));

  const registrations = people.slice(0, 7).flatMap((p, i) => [
    { serial: p.id, device: `iphone-${i}` },
    ...(i % 3 === 0 ? [{ serial: p.id, device: `watch-${i}` }] : []),
  ]);

  const events: RawEvent[] = [];
  const push = (profileId: string, kind: ProfileEventKind, source: string, daysAgo: number) =>
    events.push({ profileId, kind, source, createdAt: at(daysAgo) });
  for (const p of people.slice(0, -1)) {
    for (let d = Math.min(days, p.joinedDaysAgo) - 1; d >= 0; d -= 1) {
      const views = Math.floor(rand() * (p.popularity + 1.2));
      for (let v = 0; v < views; v += 1) {
        const roll = rand();
        push(p.id, "view", roll < 0.55 ? "qr" : roll < 0.8 ? "share" : "direct", d);
        if (rand() < 0.38) push(p.id, "vcard", "direct", d);
        if (rand() < 0.3) push(p.id, "link_click", "direct", d);
      }
      if (rand() < 0.04) push(p.id, "pass_apple", "direct", d);
      if (rand() < 0.015) push(p.id, "pass_google", "direct", d);
    }
  }

  const contactRequests = people.slice(0, 6).flatMap((p, i) =>
    Array.from({ length: (i % 3) + 1 }, () => ({ profileId: p.id, createdAt: at(Math.round(rand() * 40)) })),
  );
  const meetings = [
    { profileId: people[0]!.id, status: "confirmed", createdAt: at(3) },
    { profileId: people[0]!.id, status: "pending", createdAt: at(1) },
    { profileId: people[2]!.id, status: "declined", createdAt: at(12) },
    { profileId: people[4]!.id, status: "confirmed", createdAt: at(22) },
  ];

  return { demo: true, users, profiles, registrations, events, contactRequests, meetings, warnings: [] };
}
