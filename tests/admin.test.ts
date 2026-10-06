import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, has, type RecordedQuery } from "./helpers/fake-supabase";

/*
 * The private dashboard (/admin): its own login (env credentials, signed
 * cookie, rate limits), the numbers it shows and how it loads them.
 */

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}

const state = vi.hoisted(() => ({
  ip: "198.51.100.1",
  cookies: new Map<string, { value: string; options?: Record<string, unknown> }>(),
  admin: null as unknown,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": state.ip }),
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => state.cookies.set(name, { value, options }),
    delete: ({ name }: { name: string }) => state.cookies.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => state.admin }));

const auth = await import("@/lib/admin/auth");
const { adminLoginAction, adminLogoutAction } = await import("@/app/admin/actions");
const { hasAdminSession } = await import("@/lib/admin/session");
const { buildAdminStats, dayKey, parseAdminPeriod } = await import("@/lib/admin/stats");
const { formatPercent, niceMax, formatShortDay } = await import("@/lib/admin/format");
const { demoAdminRawData } = await import("@/lib/admin/demo");
const { loadAdminRawData } = await import("@/lib/data/admin-stats");
type AdminRawData = Parameters<typeof buildAdminStats>[0];

const CREDENTIALS = { username: "diego", password: "una-clave-muy-larga" };

let ipCounter = 0;
beforeEach(() => {
  ipCounter += 1;
  state.ip = `198.51.100.${ipCounter}`;
  state.cookies.clear();
  state.admin = null;
  vi.stubEnv("ADMIN_USERNAME", "Diego");
  vi.stubEnv("ADMIN_PASSWORD", CREDENTIALS.password);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof Redirect)) throw new Error(`expected a redirect, got ${String(error)}`);
  return error.url;
}

describe("admin credentials", () => {
  it("is off without a username or with a password under 16 characters", () => {
    expect(auth.getAdminCredentials({})).toBeNull();
    expect(auth.getAdminCredentials({ ADMIN_USERNAME: "diego" })).toBeNull();
    expect(auth.getAdminCredentials({ ADMIN_USERNAME: "diego", ADMIN_PASSWORD: "corta" })).toBeNull();
    expect(auth.getAdminCredentials({ ADMIN_USERNAME: "diego", ADMIN_PASSWORD: "a".repeat(15) })).toBeNull();
    expect(auth.getAdminCredentials({ ADMIN_USERNAME: " ", ADMIN_PASSWORD: CREDENTIALS.password })).toBeNull();
  });

  it("reads them from the env, with the username in lower case", () => {
    expect(auth.getAdminCredentials({ ADMIN_USERNAME: " Diego ", ADMIN_PASSWORD: CREDENTIALS.password })).toEqual(CREDENTIALS);
  });

  it("matches the username in any case and the password exactly", () => {
    expect(auth.credentialsMatch(CREDENTIALS, "DIEGO ", CREDENTIALS.password)).toBe(true);
    expect(auth.credentialsMatch(CREDENTIALS, "diego", CREDENTIALS.password.toUpperCase())).toBe(false);
    expect(auth.credentialsMatch(CREDENTIALS, "otro", CREDENTIALS.password)).toBe(false);
    expect(auth.credentialsMatch(CREDENTIALS, "diego", "")).toBe(false);
  });
});

describe("admin session token", () => {
  const now = Date.UTC(2026, 9, 6, 10);

  it("is valid until it expires", () => {
    const token = auth.createAdminToken(CREDENTIALS, now);
    expect(auth.isValidAdminToken(token, CREDENTIALS, now + 1000)).toBe(true);
    expect(auth.isValidAdminToken(token, CREDENTIALS, now + auth.ADMIN_SESSION_SECONDS * 1000 + 1)).toBe(false);
  });

  it("stops working when the password changes", () => {
    const token = auth.createAdminToken(CREDENTIALS, now);
    expect(auth.isValidAdminToken(token, { ...CREDENTIALS, password: "otra-clave-muy-larga" }, now)).toBe(false);
  });

  it("rejects tampered and malformed tokens", () => {
    const token = auth.createAdminToken(CREDENTIALS, now);
    const [version, expires, signature] = token.split(".");
    const later = String(Number(expires) + 86_400);
    expect(auth.isValidAdminToken(`${version}.${later}.${signature}`, CREDENTIALS, now)).toBe(false);
    expect(auth.isValidAdminToken(`${token}x`, CREDENTIALS, now)).toBe(false);
    expect(auth.isValidAdminToken(`${token}.extra`, CREDENTIALS, now)).toBe(false);
    expect(auth.isValidAdminToken(`v2.${expires}.${signature}`, CREDENTIALS, now)).toBe(false);
    expect(auth.isValidAdminToken("", CREDENTIALS, now)).toBe(false);
    expect(auth.isValidAdminToken(undefined, CREDENTIALS, now)).toBe(false);
    expect(auth.isValidAdminToken("a".repeat(500), CREDENTIALS, now)).toBe(false);
  });
});

describe("admin login", () => {
  it("does nothing while the dashboard is off", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    const result = await adminLoginAction({}, form({ username: "diego", password: CREDENTIALS.password }));
    expect(result.error).toMatch(/no está activado/);
    expect(state.cookies.size).toBe(0);
  });

  it("rejects wrong credentials without saying which part was wrong", async () => {
    const result = await adminLoginAction({}, form({ username: "diego", password: "no-es-la-clave-buena" }));
    expect(result).toEqual({ username: "diego", error: "Usuario o contraseña incorrectos." });
    expect(state.cookies.size).toBe(0);
  });

  it("sets a strict, http-only cookie scoped to /admin and goes to the dashboard", async () => {
    const url = await redirectOf(adminLoginAction({}, form({ username: "Diego", password: CREDENTIALS.password })));
    expect(url).toBe("/admin");
    const cookie = state.cookies.get(auth.ADMIN_COOKIE);
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/admin" });
    expect(await hasAdminSession(CREDENTIALS)).toBe(true);
  });

  it("slows down guessing: 5 tries per client every 15 minutes", async () => {
    for (let i = 0; i < 5; i += 1) {
      const result = await adminLoginAction({}, form({ username: "diego", password: `intento-${i}-largo` }));
      expect(result.error).toBe("Usuario o contraseña incorrectos.");
    }
    const blocked = await adminLoginAction({}, form({ username: "diego", password: CREDENTIALS.password }));
    expect(blocked.error).toMatch(/Demasiados intentos/);
    expect(state.cookies.size).toBe(0);
  });

  it("signs out by deleting the cookie", async () => {
    state.cookies.set(auth.ADMIN_COOKIE, { value: auth.createAdminToken(CREDENTIALS) });
    expect(await redirectOf(adminLogoutAction())).toBe("/admin/entrar");
    expect(await hasAdminSession(CREDENTIALS)).toBe(false);
  });
});

describe("admin stats", () => {
  const now = new Date("2026-10-06T10:00:00Z");
  const iso = (daysAgo: number, hour = 10) => new Date(now.getTime() - daysAgo * 86_400_000 + (hour - 10) * 3_600_000).toISOString();
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";
  const C = "00000000-0000-4000-8000-00000000000c";

  function raw(overrides: Partial<AdminRawData> = {}): AdminRawData {
    return {
      demo: false,
      users: [
        { id: A, email: "ana@example.com", createdAt: iso(60), lastSignInAt: iso(2) },
        { id: B, email: "bea@example.com", createdAt: iso(3), lastSignInAt: iso(3) },
        { id: C, email: "carla@example.com", createdAt: iso(1), lastSignInAt: null },
      ],
      profiles: [
        { id: A, slug: "ana", fullName: "Ana", isPublished: true, pattern: "orbitas", createdAt: iso(60) },
        { id: B, slug: "bea", fullName: " ", isPublished: false, pattern: "halo", createdAt: iso(3) },
      ],
      registrations: [
        { serial: A, device: "iphone-ana" },
        { serial: A, device: "watch-ana" },
      ],
      events: [
        { profileId: A, kind: "view", source: "qr", createdAt: iso(0) },
        { profileId: A, kind: "view", source: "share", createdAt: iso(0) },
        { profileId: A, kind: "view", source: "direct", createdAt: iso(1) },
        { profileId: A, kind: "vcard", source: "direct", createdAt: iso(1) },
        { profileId: A, kind: "pass_apple", source: "direct", createdAt: iso(1) },
        { profileId: B, kind: "view", source: "qr", createdAt: iso(2) },
        { profileId: B, kind: "view", source: "qr", createdAt: iso(20) },
      ],
      contactRequests: [
        { profileId: A, createdAt: iso(1) },
        { profileId: A, createdAt: iso(40) },
      ],
      meetings: [
        { profileId: A, status: "confirmed", createdAt: iso(2) },
        { profileId: B, status: "pending", createdAt: iso(30) },
      ],
      warnings: [],
      ...overrides,
    };
  }

  it("counts installed Apple passes per card, not per device", () => {
    const stats = buildAdminStats(raw(), { days: 7, now });
    expect(stats.totals).toMatchObject({ appleCards: 1, appleDevices: 2, users: 3, cards: 2, publishedCards: 1 });
  });

  it("only counts the selected period for activity", () => {
    const stats = buildAdminStats(raw(), { days: 7, now });
    expect(stats.period).toMatchObject({
      newUsers: 2,
      activeUsers: 2,
      views: 4,
      qrViews: 2,
      shareViews: 1,
      directViews: 1,
      vcards: 1,
      applePassTaps: 1,
      contactRequests: 1,
      meetings: 1,
      viewedCards: 2,
    });
    expect(stats.totals).toMatchObject({ contactRequests: 2, meetings: 2, meetingsConfirmed: 1 });
  });

  it("builds one point per day, ending today in Madrid", () => {
    const stats = buildAdminStats(raw(), { days: 7, now });
    expect(stats.daily).toHaveLength(7);
    expect(stats.daily.at(-1)).toEqual({ day: "2026-10-06", views: 2, qr: 1, share: 1 });
    expect(stats.daily.reduce((n, d) => n + d.views, 0)).toBe(4);
  });

  it("uses Madrid's calendar day, not UTC's", () => {
    expect(dayKey("2026-10-05T22:30:00Z")).toBe("2026-10-06");
    expect(dayKey("2026-01-05T23:30:00Z")).toBe("2026-01-06");
  });

  it("adds up sign-ups per week with a running total", () => {
    const weekly = buildAdminStats(raw(), { days: 7, now }).weekly;
    expect(weekly.at(-1)).toMatchObject({ week: "2026-10-05", total: 3 });
    expect(weekly.reduce((n, w) => n + w.signups, 0)).toBe(3);
    expect(weekly[0]!.signups).toBe(1);
  });

  it("caps the growth chart at 26 weeks and carries the older sign-ups in the total", () => {
    const users = [{ id: A, email: null, createdAt: iso(400), lastSignInAt: null }, ...raw().users.slice(1)];
    const weekly = buildAdminStats(raw({ users }), { days: 7, now }).weekly;
    expect(weekly).toHaveLength(26);
    expect(weekly.at(-1)!.total).toBe(3);
  });

  it("lists users newest first, joined with their card and activity", () => {
    const users = buildAdminStats(raw(), { days: 7, now }).users;
    expect(users.map((u) => u.id)).toEqual([C, B, A]);
    expect(users[2]).toMatchObject({
      name: "Ana",
      slug: "ana",
      published: true,
      pattern: "arco",
      appleDevices: 2,
      views: 3,
      vcards: 1,
      contactRequests: 1,
      meetings: 1,
    });
    expect(users[1]).toMatchObject({ name: "", published: false, views: 1, meetings: 0 });
    expect(users[0]).toMatchObject({ slug: null, pattern: null, views: 0 });
  });

  it("still lists cards whose user couldn't be loaded", () => {
    const stats = buildAdminStats(raw({ users: [] }), { days: 7, now });
    expect(stats.users.map((u) => u.slug)).toEqual(["bea", "ana"]);
    expect(stats.users[0]!.email).toBeNull();
  });

  it("maps retired motifs to their successors", () => {
    const stats = buildAdminStats(raw(), { days: 7, now });
    expect(stats.patterns).toEqual(
      expect.arrayContaining([
        { pattern: "arco", count: 1 },
        { pattern: "halo", count: 1 },
      ]),
    );
  });

  it("works with nothing at all", () => {
    const empty = raw({ users: [], profiles: [], registrations: [], events: [], contactRequests: [], meetings: [] });
    const stats = buildAdminStats(empty, { days: 30, now });
    expect(stats.totals.users).toBe(0);
    expect(stats.daily).toHaveLength(30);
    expect(stats.weekly).toEqual([]);
  });

  it("has a believable demo sample", () => {
    const stats = buildAdminStats(demoAdminRawData(now, 30), { days: 30, now });
    expect(stats.demo).toBe(true);
    expect(stats.totals.users).toBe(12);
    expect(stats.totals.appleCards).toBeGreaterThan(0);
    expect(stats.period.views).toBeGreaterThan(stats.period.vcards);
    expect(stats.users.every((u) => u.email?.endsWith("@example.com"))).toBe(true);
  });

  it("accepts only the offered periods", () => {
    expect(parseAdminPeriod("7")).toBe(7);
    expect(parseAdminPeriod("90")).toBe(90);
    expect(parseAdminPeriod("365")).toBe(30);
    expect(parseAdminPeriod(undefined)).toBe(30);
    expect(parseAdminPeriod(["7"])).toBe(7);
  });
});

describe("admin formatting", () => {
  it("rounds axes up to clean numbers", () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(48)).toBe(50);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(1000)).toBe(1000);
  });

  it("formats percentages and days in Spanish", () => {
    expect(formatPercent(1, 3)).toBe("33 %");
    expect(formatPercent(1, 0)).toBe("—");
    expect(formatShortDay("2026-10-06")).toBe("6 oct");
  });
});

describe("loading admin data", () => {
  const now = new Date("2026-10-06T10:00:00Z");

  function client(handler: (query: RecordedQuery) => { data?: unknown; error?: { message: string } | null }, users: unknown[] = []) {
    const fake = fakeSupabase(handler);
    const listUsers = vi.fn(async ({ page }: { page: number }) => ({
      data: { users: page === 1 ? users : [] },
      error: null,
    }));
    state.admin = Object.assign(fake.client, { auth: { admin: { listUsers } } });
    return { ...fake, listUsers };
  }

  it("returns null without the secret key (demo mode)", async () => {
    expect(await loadAdminRawData(30, now)).toBeNull();
  });

  it("reads every table, never the push tokens, and only the period's events", async () => {
    const { queries } = client(
      (q) => {
        if (q.table === "profiles") return { data: [{ id: "p1", slug: "ana", full_name: "Ana", is_published: true, pattern: "arco", created_at: "2026-10-01T00:00:00Z" }] };
        if (q.table === "apple_pass_registrations") return { data: [{ serial_number: "p1", device_library_id: "d1" }] };
        return { data: [] };
      },
      [{ id: "p1", email: "ana@example.com", created_at: "2026-10-01T00:00:00Z", last_sign_in_at: null }],
    );

    const data = await loadAdminRawData(30, now);
    expect(data).toMatchObject({
      demo: false,
      users: [{ id: "p1", email: "ana@example.com" }],
      profiles: [{ id: "p1", slug: "ana", fullName: "Ana" }],
      registrations: [{ serial: "p1", device: "d1" }],
      warnings: [],
    });
    const registrations = queries.find((q) => q.table === "apple_pass_registrations")!;
    expect(JSON.stringify(registrations.calls)).not.toContain("push_token");
    const events = queries.find((q) => q.table === "profile_events")!;
    expect(has(events, "gte", "created_at", "2026-09-06T10:00:00.000Z")).toBe(true);
  });

  it("pages through more than 1000 rows", async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ profile_id: "p1", kind: "view", source: "qr", created_at: `2026-10-0${1 + (i % 5)}T00:00:00Z` }));
    let eventPages = 0;
    client((q) => {
      if (q.table !== "profile_events") return { data: [] };
      eventPages += 1;
      return { data: page(eventPages === 1 ? 1000 : 250) };
    });
    const data = await loadAdminRawData(30, now);
    expect(eventPages).toBe(2);
    expect(data!.events).toHaveLength(1250);
  });

  it("keeps going when one table fails, and says so", async () => {
    client((q) => (q.table === "meeting_requests" ? { error: { message: "relation does not exist" } } : { data: [] }));
    const data = await loadAdminRawData(30, now);
    expect(data!.meetings).toEqual([]);
    expect(data!.warnings).toEqual(["No se han podido cargar las reuniones."]);
  });
});
