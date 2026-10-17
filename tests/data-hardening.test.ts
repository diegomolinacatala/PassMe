import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ValidCardInput } from "@/lib/card/schema";
import { parseQuickDraft, type ValidQuickDraft } from "@/lib/card/quick";
import {
  createCardFromDraft,
  EMPTY_STATS,
  getOwnStats,
  getPublicCard,
  lookupPublicCard,
  saveOwnerCard,
} from "@/lib/data/cards";
import { verifyApplePassToken } from "@/lib/data/wallet";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { fakeSupabase, first } from "./helpers/fake-supabase";

const USER = "11111111-1111-4111-8111-111111111111";

function row(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: USER,
    slug: "alex",
    full_name: "Alex Rivera",
    headline: "Designer",
    company: "Norte",
    location: "",
    pronouns: "",
    bio: "",
    accent_color: "#ff4a1c",
    detail_color: "#ffe3d1",
    pattern: "corriente",
    pattern_seed: 123,
    typeface: "cursiva",
    avatar_path: null,
    links: [],
    is_published: true,
    accepts_contact_requests: false,
    accepts_meeting_requests: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    ...overrides,
  };
}

const input: ValidCardInput = {
  slug: "alex",
  fullName: "Alex Rivera",
  headline: "Designer",
  company: "Norte",
  location: "",
  pronouns: "",
  bio: "",
  accentColor: "#FF4A1C",
  detailColor: null,
  pattern: "persiana",
  patternSeed: 77,
  typeface: "moderna",
  avatarPath: null,
  isPublished: true,
  links: [],
};

function quickDraft(): ValidQuickDraft {
  const parsed = parseQuickDraft({
    fullName: "José Núñez",
    headline: "CEO",
    company: "Norte",
    phone: "600 11 22 33",
    email: "JOSE@example.com",
    linkedin: "",
    theme: "cafe",
    patternSeed: 4242,
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.data;
}

function stubSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lookupPublicCard: a miss is not a failure", () => {
  const card = {
    slug: "alex",
    full_name: "Alex Rivera",
    headline: "Designer",
    accent_color: "#ff4a1c",
    links: [],
  };

  it("serves the demo card and treats malformed or unknown slugs as plain misses", async () => {
    expect(await lookupPublicCard("DEMO")).toMatchObject({ status: "found", card: { slug: "demo" } });
    expect(await lookupPublicCard("../../etc")).toEqual({ status: "missing" });
    // No Supabase in this environment: nothing to look in.
    expect(await lookupPublicCard("alex")).toEqual({ status: "missing" });
  });

  it("returns found for a published card and missing when the database says there is none", async () => {
    stubSupabase();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(card)));
    expect(await lookupPublicCard("alex")).toMatchObject({ status: "found", card: { slug: "alex", fullName: "Alex Rivera" } });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(null)));
    expect(await lookupPublicCard("ghost")).toEqual({ status: "missing" });
    // A row without a name is not a card.
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ slug: "alex", full_name: "" })));
    expect(await lookupPublicCard("alex-2")).toEqual({ status: "missing" });
  });

  it("returns error, never missing, when the database fails", async () => {
    stubSupabase();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "boom", code: "XX000" }), { status: 500, headers: { "content-type": "application/json" } })),
    );
    expect(await lookupPublicCard("alex-a")).toEqual({ status: "error" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await lookupPublicCard("alex-b")).toEqual({ status: "error" });
    // A shape the function should never return is a bug, not a missing card.
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([1, 2])));
    expect(await lookupPublicCard("alex-c")).toEqual({ status: "error" });
    expect(error).toHaveBeenCalledTimes(3);
  });

  it("keeps getPublicCard's null-on-anything contract for callers that don't care", async () => {
    stubSupabase();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(card)));
    expect((await getPublicCard("alex-d"))?.fullName).toBe("Alex Rivera");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500, headers: { "content-type": "application/json" } })));
    expect(await getPublicCard("alex-e")).toBeNull();
  });
});

describe("saveOwnerCard checks a new photo before the card points at it", () => {
  const avatarPath = `${USER}/avatar-new.jpg`;
  const withAvatar = { ...input, avatarPath };

  const photo = (size: number) => sharp({ create: { width: size, height: size, channels: 3, background: "#EF7A4A" } }).jpeg().toBuffer();
  const serve = (body: Buffer, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(body), { status })));
  const updates = (queries: ReturnType<typeof fakeSupabase>["queries"]) => queries.filter((q) => first(q) === "update");

  it("rejects a photo over 1024 px without writing anything", async () => {
    stubSupabase();
    serve(await photo(1200));
    const { client, queries } = fakeSupabase(() => ({ data: row() }));
    const result = await saveOwnerCard(client, USER, withAvatar);
    expect(result).toEqual({ ok: false, errors: { avatarPath: "La foto es demasiado grande. Elige otra." } });
    expect(updates(queries)).toHaveLength(0);
  });

  it("rejects something that isn't a photo", async () => {
    stubSupabase();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<svg/>", { status: 200 })));
    const { client, queries } = fakeSupabase(() => ({ data: row() }));
    expect(await saveOwnerCard(client, USER, withAvatar)).toMatchObject({ ok: false, errors: { avatarPath: expect.stringMatching(/foto/) } });
    expect(updates(queries)).toHaveLength(0);
  });

  it("saves a normal photo, and fetches nothing when the photo didn't change", async () => {
    stubSupabase();
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(await photo(512)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = fakeSupabase((q) => ({ data: first(q) === "update" ? row({ avatar_path: avatarPath }) : row() }));
    expect(await saveOwnerCard(client, USER, withAvatar)).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();

    fetchMock.mockClear();
    const same = fakeSupabase(() => ({ data: row({ avatar_path: avatarPath }) }));
    expect(await saveOwnerCard(same.client, USER, withAvatar)).toMatchObject({ ok: true });
    expect(await saveOwnerCard(same.client, USER, input)).toMatchObject({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still saves when storage can't be reached to check the photo", async () => {
    stubSupabase();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const { client } = fakeSupabase((q) => ({ data: first(q) === "update" ? row({ avatar_path: avatarPath }) : row() }));
    expect(await saveOwnerCard(client, USER, withAvatar)).toMatchObject({ ok: true });
  });

  it("works in demo mode and in tests without Supabase: there is no photo URL to check", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { client } = fakeSupabase((q) => ({ data: first(q) === "update" ? row({ avatar_path: avatarPath }) : row() }));
    expect(await saveOwnerCard(client, USER, withAvatar)).toMatchObject({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createCardFromDraft reports what the database couldn't store", () => {
  const missing = { message: "Could not find the 'typeface' column of 'profiles' in the schema cache", code: "PGRST204" };

  it("logs the dropped design fields and flags the result when a migration is pending", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let inserts = 0;
    const { client } = fakeSupabase((q) => {
      if (first(q) === "select") return { data: null };
      inserts += 1;
      return inserts === 1 ? { error: missing } : { data: row() };
    });
    const result = await createCardFromDraft(client, USER, quickDraft());
    expect(result).toMatchObject({ ok: true, created: true, designPending: true });
    const lines = warn.mock.calls.map((call) => String(call[0]));
    const summary = lines.find((line) => line.includes("created without some design fields"));
    expect(summary).toBeDefined();
    expect(summary).toContain(USER);
    expect(summary).toContain("typeface");
  });

  it("stays quiet and unflagged when everything was stored", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client } = fakeSupabase((q) => (first(q) === "select" ? { data: null } : { data: row() }));
    const result = await createCardFromDraft(client, USER, quickDraft());
    expect(result).toMatchObject({ ok: true, created: true });
    expect(result).not.toHaveProperty("designPending");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("getOwnStats does not turn a failure into zeros", () => {
  it("flags the stats as unavailable when the RPC fails or answers nonsense", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const result of [{ error: { message: "nope" } }, { data: null }, { data: [] }, { data: "x" }]) {
      const { client } = fakeSupabase(() => result);
      const stats = await getOwnStats(client, 7);
      expect(stats, JSON.stringify(result)).toMatchObject({ unavailable: true, views: 0, days: 7 });
    }
  });

  it("doesn't flag real stats, not even all-zero ones", async () => {
    const { client } = fakeSupabase(() => ({ data: { days: 30, views: 0, qr_views: 0, vcard_downloads: 0, wallet_adds: 0, link_clicks: {}, daily_views: [] } }));
    const stats = await getOwnStats(client);
    expect(stats).not.toHaveProperty("unavailable");
    expect(stats).toEqual(EMPTY_STATS);
  });
});

describe("verifyApplePassToken", () => {
  it("returns false for a missing row or a wrong token, and throws when the database fails", async () => {
    const wrong = fakeSupabase(() => ({ data: { apple_auth_token: "a".repeat(64) } }));
    expect(await verifyApplePassToken(wrong.client, USER, "b".repeat(64))).toBe(false);
    const none = fakeSupabase(() => ({ data: null }));
    expect(await verifyApplePassToken(none.client, USER, "a".repeat(64))).toBe(false);
    const broken = fakeSupabase(() => ({ error: { message: "db is down" } }));
    await expect(verifyApplePassToken(broken.client, USER, "a".repeat(64))).rejects.toThrow(/db is down/);
  });
});
