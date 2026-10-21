import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  A,
  B,
  C,
  contactRequest,
  event,
  iso,
  meeting,
  NOW,
  profile,
  rawData,
  referral,
  registration,
  user,
} from "./helpers/admin-raw";
import { fakeSupabase } from "./helpers/fake-supabase";

/*
 * The CRM's pages beyond the summary (users, a user's page, wallet, activity,
 * "Mis contactos"), its spreadsheet export, and the new data it relies on:
 * the visitor's device and country, and who brought each new card.
 */

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  admin: null as unknown,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: () => undefined,
    delete: () => undefined,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => state.admin }));

const { buildUserRows, parseUserListQuery, selectUsers, usersToCsv } = await import("@/lib/admin/users");
const { buildUserDetail } = await import("@/lib/admin/user-detail");
const { buildWalletOverview } = await import("@/lib/admin/wallet");
const { buildActivity, parseActivityFilter } = await import("@/lib/admin/activity");
const { buildLeads } = await import("@/lib/admin/leads");
const { demoAdminRawData, demoOwnLeads, demoProfileId } = await import("@/lib/admin/demo");
const { visitorContext } = await import("@/lib/request");
const { recordReferral } = await import("@/lib/data/referrals");
const auth = await import("@/lib/admin/auth");
const { GET: exportUsers } = await import("@/app/crm/usuarios.csv/route");

const { periodStart } = await import("@/lib/admin/days");
const WEEK = periodStart(NOW, 7);

beforeEach(() => {
  state.cookies.clear();
  state.admin = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function sample() {
  return rawData({
    users: [
      user(A, { email: "ana@example.com", createdAt: iso(60), lastSignInAt: iso(2), provider: "google" }),
      user(B, { email: "bea@example.com", createdAt: iso(20), lastSignInAt: iso(45) }),
      user(C, { email: "carla@example.com", createdAt: iso(1) }),
    ],
    profiles: [
      profile(A, {
        slug: "ana",
        fullName: "Ana Núñez",
        company: "Estudio Norte",
        createdAt: iso(60),
        links: [
          { id: "link-mail", kind: "email", visible: true, label: "", value: "ana@example.com" },
          { id: "link-tel", kind: "phone", visible: false, label: "", value: "" },
        ],
      }),
      profile(B, { slug: "bea", fullName: "Bea", isPublished: true, createdAt: iso(20) }),
    ],
    registrations: [registration(A, "iphone", { createdAt: iso(50) }), registration(A, "watch", { createdAt: iso(40) })],
    events: [
      event(A, "view", { source: "qr", platform: "ios", country: "ES" }),
      event(A, "view", { source: "qr", platform: "ios", country: "ES", createdAt: iso(1) }),
      event(A, "vcard", { source: "qr", platform: "android" }),
      event(A, "link_click", { linkId: "link-mail" }),
      event(B, "view", { source: "share" }),
      event(B, "pass_apple", { createdAt: iso(2) }),
      event(B, "pass_google", { createdAt: iso(2) }),
      event(A, "view", { createdAt: iso(30) }),
    ],
    contactRequests: [contactRequest(A, { source: "qr" }), contactRequest(A, { source: "share", createdAt: iso(20) })],
    meetings: [meeting(A, { status: "confirmed", format: "in_person" })],
    referrals: [referral(B, A, { via: "share" }), referral(C, null)],
  });
}

describe("user rows", () => {
  it("joins each account with its card, wallet, period activity and who brought them", () => {
    const rows = buildUserRows(sample(), WEEK);
    expect(rows.map((r) => r.id)).toEqual([C, B, A]);
    expect(rows.find((r) => r.id === A)).toMatchObject({
      name: "Ana Núñez",
      provider: "google",
      appleDevices: 2,
      walletSince: iso(50),
      views: 2,
      qrViews: 2,
      vcards: 1,
      linkClicks: 1,
      contactRequests: 1,
      meetings: 1,
      referred: 1,
      referralKnown: false,
      referrer: null,
    });
    expect(rows.find((r) => r.id === B)).toMatchObject({
      referralKnown: true,
      referrer: { id: A, name: "Ana Núñez", slug: "ana" },
      via: "share",
      applePassTaps: 1,
      googlePassTaps: 1,
    });
    expect(rows.find((r) => r.id === C)).toMatchObject({ slug: null, referralKnown: true, referrer: null, via: null });
  });
});

describe("user list: search, filters and order", () => {
  const rows = () => buildUserRows(sample(), WEEK);
  const pick = (params: Record<string, unknown>) => selectUsers(rows(), parseUserListQuery(params), NOW.getTime()).map((r) => r.id);

  it("reads only known filters and orders from the URL, and trims the search", () => {
    expect(parseUserListQuery({ f: "nope", orden: ["visitas"], q: "  ana  " })).toEqual({ filter: "todos", sort: "visitas", search: "ana" });
    expect(parseUserListQuery({ q: "x".repeat(500) }).search).toHaveLength(80);
    expect(parseUserListQuery({ f: "__proto__" }).filter).toBe("todos");
  });

  it("finds people by name, email, link or company, ignoring accents and case", () => {
    expect(pick({ q: "NUNEZ" })).toEqual([A]);
    expect(pick({ q: "bea@" })).toEqual([B]);
    expect(pick({ q: "norte" })).toEqual([A]);
    expect(pick({ q: "nadie" })).toEqual([]);
  });

  it("filters by card, wallet and recent sign-ins", () => {
    expect(pick({ f: "wallet" })).toEqual([A]);
    expect(pick({ f: "sin-wallet" })).toEqual([B]);
    expect(pick({ f: "sin-tarjeta" })).toEqual([C]);
    expect(pick({ f: "dormidos" })).toEqual([C, B]);
  });

  it("orders by the chosen column, newest sign-up breaking ties", () => {
    expect(pick({ orden: "visitas" })).toEqual([A, B, C]);
    expect(pick({ orden: "trajo" })).toEqual([A, C, B]);
    expect(pick({ orden: "nombre" })).toEqual([A, B, C]);
  });
});

describe("users spreadsheet", () => {
  it("has one row per account, Madrid times, and neutralizes formulas", () => {
    const rows = buildUserRows(sample(), WEEK).map((r) => (r.id === B ? { ...r, name: "=HYPERLINK(\"x\")" } : r));
    const csv = usersToCsv(rows, 7, "https://getpassme.com");
    const lines = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('"Visitas (7 días)"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"https://getpassme.com/u/ana"');
    expect(csv).toContain('"Ana Núñez (/u/ana), con un enlace compartido"');
    expect(csv).toMatch(/"2026-0\d-\d\d \d\d:\d\d"/);
  });
});

describe("a user's page", () => {
  it("is null for an unknown id", () => {
    expect(buildUserDetail(sample(), "00000000-0000-4000-8000-0000000000ff", NOW)).toBeNull();
  });

  it("shows visible links with their clicks and hidden ones without their value", () => {
    const detail = buildUserDetail(sample(), A, NOW)!;
    expect(detail.links).toEqual([
      { id: "link-mail", kind: "email", title: "Email", value: "ana@example.com", visible: true, clicks: 1 },
      { id: "link-tel", kind: "phone", title: "Teléfono", value: "", visible: false, clicks: 0 },
    ]);
  });

  it("counts 90 days of activity, devices, countries and what others left them", () => {
    const detail = buildUserDetail(sample(), A, NOW)!;
    expect(detail.activity).toMatchObject({ views: 3, qr: 2, direct: 1, vcards: 1, clicks: 1 });
    expect(detail.daily).toHaveLength(90);
    expect(detail.platforms).toEqual([{ key: "ios", label: "iPhone", count: 2 }]);
    expect(detail.vcardPlatforms).toEqual([{ key: "android", label: "Android", count: 1 }]);
    expect(detail.countries.map((c) => c.label)).toEqual(["España"]);
    expect(detail.devicesAddedAt).toEqual([iso(50), iso(40)]);
    expect(detail.contacts).toMatchObject({ total: 2, last: iso(1) });
    expect(detail.meetings.byStatus).toEqual([{ key: "confirmed", label: "Confirmadas", count: 1 }]);
    expect(detail.referredUsers).toEqual([{ id: B, name: "Bea", slug: "bea", createdAt: iso(3), via: "share" }]);
  });

  it("tells their story newest first, without anyone else's details", () => {
    const detail = buildUserDetail(sample(), B, NOW)!;
    const texts = detail.timeline.map((t) => t.text);
    expect(texts).toContain("Se dio de alta, desde la tarjeta de Ana Núñez, con un enlace compartido");
    expect(texts).toContain("Creó su tarjeta /u/bea");
    const ana = buildUserDetail(sample(), A, NOW)!.timeline.map((t) => t.text);
    expect(ana).toContain("Alguien le dejó su contacto (QR)");
    expect(ana).toContain("Le propusieron una reunión (confirmada)");
    expect(ana).toContain("Bea creó su tarjeta desde la suya");
    const times = detail.timeline.map((t) => Date.parse(t.at));
    expect(times).toEqual([...times].sort((x, y) => y - x));
  });

  it("always keeps the sign-up and the card in a long history", () => {
    const many = Array.from({ length: 60 }, (_, i) => contactRequest(A, { createdAt: iso(i % 9) }));
    const texts = buildUserDetail({ ...sample(), contactRequests: many }, A, NOW)!.timeline.map((t) => t.text);
    expect(texts).toHaveLength(40);
    expect(texts.some((t) => t.startsWith("Se dio de alta"))).toBe(true);
    expect(texts).toContain("Creó su tarjeta /u/ana");
    expect(texts.filter((t) => t === "Añadió su pase a un dispositivo Apple")).toHaveLength(2);
  });

  it("says when the card that brought someone was deleted since", () => {
    const raw = { ...sample(), referrals: [referral(B, null, { via: "qr" })] };
    expect(buildUserRows(raw, WEEK).find((r) => r.id === B)).toMatchObject({ referrer: null, via: "qr", referralKnown: true });
    const csv = usersToCsv(buildUserRows(raw, WEEK), 7, "https://getpassme.com");
    expect(csv).toContain('"Una tarjeta ya borrada, escaneando el QR"');
  });
});

describe("wallet", () => {
  it("lists who has the pass, who tried, who tapped Google and who has none", () => {
    const wallet = buildWalletOverview(sample(), { days: 7, now: NOW });
    expect(wallet).toMatchObject({ appleCards: 1, appleDevices: 2, publishedCards: 2, publishedWithPass: 1 });
    expect(wallet.installed.map((r) => [r.id, r.walletSince])).toEqual([[A, iso(50)]]);
    expect(wallet.triedApple.map((r) => r.id)).toEqual([B]);
    expect(wallet.triedGoogle.map((r) => r.id)).toEqual([B]);
    expect(wallet.withoutPass.map((r) => r.id)).toEqual([B]);
  });
});

describe("activity", () => {
  it("merges every kind of event, newest first, within the period", () => {
    const { items, total } = buildActivity(sample(), { days: 7, now: NOW, filter: "todo" });
    expect(total).toBe(items.length);
    expect(items.every((i) => Date.parse(i.at) >= WEEK)).toBe(true);
    const times = items.map((i) => Date.parse(i.at));
    expect(times).toEqual([...times].sort((x, y) => y - x));
    const texts = items.map((i) => `${i.name}: ${i.text}`);
    expect(texts).toContain("Ana Núñez: Visitaron su tarjeta · QR · iPhone · España");
    expect(texts).toContain("Ana Núñez: Pulsaron su Email");
    expect(texts).toContain("Ana Núñez: Alguien le dejó su contacto · QR");
    expect(texts).toContain("carla@example.com: Se dio de alta");
    const month = buildActivity(sample(), { days: 30, now: NOW, filter: "altas" }).items.map((i) => `${i.name}: ${i.text}`);
    expect(month).toContain("Bea: Se dio de alta, desde la tarjeta de Ana Núñez, con un enlace compartido");
  });

  it("filters by kind", () => {
    const wallet = buildActivity(sample(), { days: 7, now: NOW, filter: "wallet" }).items;
    expect(wallet.map((i) => i.kind).sort()).toEqual(["pass_apple", "pass_google"]);
    expect(parseActivityFilter("contactos")).toBe("contactos");
    expect(parseActivityFilter("toString")).toBe("todo");
  });
});

describe("Mis contactos", () => {
  const request = (id: string, fields: Partial<Parameters<typeof buildLeads>[0][number]> = {}) => ({
    id,
    name: "Lucía",
    email: "lucia@example.com",
    phone: null,
    company: "",
    message: "",
    source: "qr" as const,
    createdAt: iso(5),
    ...fields,
  });

  it("joins the same person by email (any case) or phone, newest details first", () => {
    const leads = buildLeads(
      [
        request("c1", { createdAt: iso(5) }),
        request("c2", { name: "Jorge", email: null, phone: "+34 611 222 333", createdAt: iso(3) }),
        request("c3", { name: "Jorge P.", email: null, phone: "+34611222333", company: "Peña", createdAt: iso(1) }),
      ],
      [
        {
          id: "m1",
          status: "confirmed",
          format: "video",
          topic: "Web",
          source: "share",
          createdAt: iso(2),
          confirmedStart: iso(-2),
          guest: { name: "Lucía Martín", email: "LUCIA@example.com", phone: null, company: "Hotel" },
        },
      ],
    );
    expect(leads.map((l) => [l.name, l.touches.map((t) => t.id)])).toEqual([
      ["Jorge P.", ["c3", "c2"]],
      ["Lucía Martín", ["m1", "c1"]],
    ]);
    expect(leads[1]).toMatchObject({ company: "Hotel", firstAt: iso(5), lastAt: iso(2) });
  });

  it("keeps people without email or phone apart", () => {
    expect(buildLeads([request("c1", { email: null }), request("c2", { email: null })], [])).toHaveLength(2);
  });

  it("has a demo for the first sample card", () => {
    const { requests, meetings } = demoOwnLeads(NOW);
    expect(buildLeads(requests, meetings).length).toBeGreaterThan(2);
    expect(buildUserDetail(demoAdminRawData(NOW, 90), demoProfileId(0), NOW)?.row.name).toBe("Alex Rivera");
  });
});

describe("visitor context", () => {
  it("keeps the kind of device and a two-letter country, never the IP", () => {
    const iphone = new Headers({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "x-vercel-ip-country": "es", "x-forwarded-for": "203.0.113.9" });
    expect(visitorContext(iphone)).toEqual({ platform: "ios", country: "ES" });
    expect(visitorContext(new Headers({ "user-agent": "Mozilla/5.0 (Linux; Android 14)" }))).toEqual({ platform: "android", country: null });
    expect(visitorContext(new Headers({ "x-vercel-ip-country": "XX" })).country).toBeNull();
    expect(visitorContext(new Headers({ "x-vercel-ip-country": "ESP" })).country).toBeNull();
  });
});

describe("referrals", () => {
  it("does nothing without the secret key", async () => {
    await expect(recordReferral(B, "ana", "qr")).resolves.toBeUndefined();
  });

  it("notes whose card led here and how", async () => {
    const fake = fakeSupabase((q) => (q.table === "profiles" ? { data: { id: A } } : {}));
    state.admin = fake.client;
    await recordReferral(B, "ana", "qr");
    const upsert = fake.queries.find((q) => q.table === "profile_referrals")!;
    expect(upsert.calls[0]).toEqual(["upsert", [{ profile_id: B, referrer_id: A, via: "qr" }, { onConflict: "profile_id", ignoreDuplicates: true }]]);
  });

  it("records 'on their own' without a card, or when the card is their own or unknown", async () => {
    for (const [from, found] of [[null, null], ["ana", { id: B }], ["ghost", null]] as const) {
      const fake = fakeSupabase((q) => (q.table === "profiles" ? { data: found } : {}));
      state.admin = fake.client;
      await recordReferral(B, from, "qr");
      const upsert = fake.queries.find((q) => q.table === "profile_referrals")!;
      expect(upsert.calls[0]![1][0]).toEqual({ profile_id: B, referrer_id: null, via: "direct" });
    }
  });

  it("stays quiet while the migration is pending, and never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.admin = fakeSupabase(() => ({ error: { message: "relation does not exist", code: "PGRST205" } })).client;
    await expect(recordReferral(B, null, "direct")).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    state.admin = {
      from: () => {
        throw new Error("boom");
      },
    };
    await expect(recordReferral(B, "ana", "qr")).resolves.toBeUndefined();
  });
});

describe("users spreadsheet route", () => {
  const CREDENTIALS = { username: "diego", password: "una-clave-muy-larga" };
  const request = (accept = "text/csv") =>
    Object.assign(new Request("https://getpassme.com/crm/usuarios.csv?d=7&f=wallet", { headers: { accept } }), {
      nextUrl: new URL("https://getpassme.com/crm/usuarios.csv?d=7&f=wallet"),
    }) as unknown as Parameters<typeof exportUsers>[0];

  it("is a 404 while the CRM is off", async () => {
    expect((await exportUsers(request())).status).toBe(404);
  });

  it("needs a CRM session", async () => {
    vi.stubEnv("ADMIN_USERNAME", CREDENTIALS.username);
    vi.stubEnv("ADMIN_PASSWORD", CREDENTIALS.password);
    expect((await exportUsers(request())).status).toBe(401);
    const navigation = await exportUsers(request("text/html"));
    expect(navigation.status).toBe(303);
    expect(navigation.headers.get("location")).toMatch(/\/crm\/entrar$/);
  });

  it("downloads the filtered list with a session (demo data without Supabase)", async () => {
    vi.stubEnv("ADMIN_USERNAME", CREDENTIALS.username);
    vi.stubEnv("ADMIN_PASSWORD", CREDENTIALS.password);
    state.cookies.set(auth.ADMIN_COOKIE, auth.createAdminToken(CREDENTIALS));
    const response = await exportUsers(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.text();
    const demo = buildUserRows(demoAdminRawData(new Date(), 7), Date.now() - 7 * 86_400_000).filter((r) => r.appleDevices > 0);
    expect(body.trim().split("\r\n")).toHaveLength(demo.length + 1);
  });
});
