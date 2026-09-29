import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_CARD } from "@/lib/card/demo";
import type { ValidCardInput } from "@/lib/card/schema";
import { parseQuickDraft, type ValidQuickDraft } from "@/lib/card/quick";
import {
  createCardFromDraft,
  findOwnerCard,
  getOwnStats,
  getPublicCard,
  isSlugAvailable,
  resolveSlugRedirect,
  rowToOwnerCard,
  saveOwnerCard,
  toPublicCard,
} from "@/lib/data/cards";
import {
  deleteRegistrationsForPushTokens,
  ensureApplePassToken,
  getCardById,
  getPushTokensForSerial,
  listUpdatedSerials,
  registerDevice,
  unregisterDevice,
  verifyApplePassToken,
} from "@/lib/data/wallet";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { fakeSupabase, first, has } from "./helpers/fake-supabase";

const USER = "11111111-1111-4111-8111-111111111111";
const UNIQUE = { message: "duplicate key", code: "23505" };

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
    pattern: "relieve",
    pattern_seed: 123,
    typeface: "cursiva",
    avatar_path: null,
    links: [
      { id: "l-email-1", kind: "email", value: "alex@example.com", visible: true },
      { id: "l-phone-1", kind: "phone", value: "+34 600 000 000", visible: false },
      { id: "bad", kind: "email", value: "x", visible: true },
    ],
    is_published: true,
    accepts_contact_requests: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    ...overrides,
  };
}

const input: ValidCardInput = {
  slug: "alex-new",
  fullName: "Alex Rivera",
  headline: "Designer",
  company: "Norte",
  location: "",
  pronouns: "",
  bio: "",
  accentColor: "#FF4A1C",
  detailColor: null,
  pattern: "trama",
  patternSeed: 77,
  typeface: "moderna",
  avatarPath: null,
  isPublished: true,
  links: [],
};

afterEach(() => vi.unstubAllEnvs());

describe("row mapping", () => {
  it("normalizes colors, drops invalid links and hides hidden ones publicly", () => {
    const card = rowToOwnerCard(row({ accent_color: "nonsense" }));
    expect(card.accentColor).toBe("#EF7A4A");
    expect(card).toMatchObject({ detailColor: "#FFE3D1", pattern: "relieve", patternSeed: 123, typeface: "cursiva" });

    const odd = rowToOwnerCard(row({ detail_color: "lime", pattern: "tartan", pattern_seed: -4, typeface: "comic" }));
    expect(odd).toMatchObject({ detailColor: null, pattern: "orbitas", patternSeed: 0, typeface: "clasica" });
    expect(card.links.map((l) => l.id)).toEqual(["l-email-1", "l-phone-1"]);
    expect(toPublicCard(card).links.map((l) => l.id)).toEqual(["l-email-1"]);
  });

  it("reads cards saved before the redesign", () => {
    const legacy = { ...row({ pattern: "ondas" }) } as Partial<ProfileRow>;
    delete legacy.typeface;
    expect(rowToOwnerCard(legacy as ProfileRow)).toMatchObject({ pattern: "cinta", typeface: "clasica" });
    expect(rowToOwnerCard(row({ pattern: "sello" })).pattern).toBe("orbitas");
  });
});

describe("getPublicCard", () => {
  it("serves the demo card without Supabase and nothing else", async () => {
    expect((await getPublicCard("DEMO"))?.fullName).toBe(DEMO_CARD.fullName);
    expect(await getPublicCard("alex")).toBeNull();
    expect(await getPublicCard("../../etc")).toBeNull();
  });
});

function quickDraft(overrides: Record<string, unknown> = {}): ValidQuickDraft {
  const parsed = parseQuickDraft({
    fullName: "José Núñez",
    headline: "CEO",
    company: "Norte",
    phone: "600 11 22 33",
    email: "JOSE@example.com",
    linkedin: "",
    theme: "cafe",
    patternSeed: 4242,
    ...overrides,
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.data;
}

describe("findOwnerCard", () => {
  it("returns the card or null, never creating one", async () => {
    const found = fakeSupabase(() => ({ data: row() }));
    expect((await findOwnerCard(found.client, USER))?.slug).toBe("alex");
    const missing = fakeSupabase(() => ({ data: null }));
    expect(await findOwnerCard(missing.client, USER)).toBeNull();
    expect(missing.queries.map(first)).toEqual(["select"]);
  });
});

describe("createCardFromDraft", () => {
  it("leaves an existing card untouched", async () => {
    const { client, queries } = fakeSupabase(() => ({ data: row() }));
    const result = await createCardFromDraft(client, USER, quickDraft());
    expect(result).toMatchObject({ ok: true, created: false, card: { slug: "alex" } });
    expect(queries).toHaveLength(1);
  });

  it("creates a published card with the handle made from the name", async () => {
    let inserted: Record<string, unknown> | null = null;
    const { client } = fakeSupabase((q) => {
      if (first(q) !== "insert") return { data: null };
      inserted = q.calls[0]![1][0] as Record<string, unknown>;
      return { data: row({ ...(inserted as Partial<ProfileRow>), full_name: "José Núñez" }) };
    });
    const result = await createCardFromDraft(client, USER, quickDraft());
    expect(result).toMatchObject({ ok: true, created: true });
    expect(inserted).toMatchObject({
      id: USER,
      slug: "jose-nunez",
      full_name: "José Núñez",
      headline: "CEO",
      company: "Norte",
      accent_color: "#3E2C23",
      detail_color: "#F0A574",
      pattern_seed: 4242,
      is_published: true,
    });
    const links = (inserted as unknown as { links: Array<{ id: string; kind: string; value: string }> }).links;
    expect(links.map((l) => [l.kind, l.value])).toEqual([
      ["phone", "600 11 22 33"],
      ["email", "jose@example.com"],
    ]);
    expect(new Set(links.map((l) => l.id)).size).toBe(2);
    expect(inserted).not.toHaveProperty("accepts_contact_requests");
  });

  it("adds a suffix when the handle is taken", async () => {
    const slugs: string[] = [];
    const { client } = fakeSupabase((q) => {
      if (first(q) !== "insert") return { data: null };
      const payload = q.calls[0]![1][0] as { slug: string };
      slugs.push(payload.slug);
      return slugs.length === 1 ? { error: UNIQUE } : { data: row({ slug: payload.slug }) };
    });
    const result = await createCardFromDraft(client, USER, quickDraft());
    expect(result).toMatchObject({ ok: true, created: true });
    expect(slugs[0]).toBe("jose-nunez");
    expect(slugs[1]).toMatch(/^jose-nunez-[0-9a-f]{4}$/);
  });

  it("uses a placeholder handle when the name can't be one", async () => {
    let slug = "";
    const { client } = fakeSupabase((q) => {
      if (first(q) !== "insert") return { data: null };
      slug = (q.calls[0]![1][0] as { slug: string }).slug;
      return { data: row({ slug }) };
    });
    await createCardFromDraft(client, USER, quickDraft({ fullName: "Demo" }));
    expect(slug).toMatch(/^tarjeta-[0-9a-f]{4}$/);
  });

  it("fills in an empty card the editor created earlier", async () => {
    const { client, queries } = fakeSupabase((q) => {
      if (first(q) === "update") return { data: row({ slug: "jose-nunez", full_name: "José Núñez", updated_at: "2026-09-03T00:00:00Z" }) };
      return { data: row({ slug: "tarjeta-3f9a1c", full_name: "" }) };
    });
    const result = await createCardFromDraft(client, USER, quickDraft());
    expect(result).toMatchObject({ ok: true, created: true, card: { slug: "jose-nunez" } });
    expect(queries.some((q) => first(q) === "insert")).toBe(false);
  });

  it("creates cards on databases without the design migration", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const { client } = fakeSupabase((q) => {
      if (first(q) !== "insert") return { data: null };
      payloads.push(q.calls[0]![1][0] as Record<string, unknown>);
      return payloads.length === 1
        ? { error: { message: 'column "detail_color" of relation "profiles" does not exist', code: "42703" } }
        : { data: row() };
    });
    expect(await createCardFromDraft(client, USER, quickDraft())).toMatchObject({ ok: true });
    expect(payloads[0]).toHaveProperty("pattern_seed");
    expect(payloads[1]).not.toHaveProperty("pattern_seed");
    expect(payloads[1]!.slug).toBe(payloads[0]!.slug);
  });

  it("gives way to another tab that created the card first", async () => {
    let selects = 0;
    const { client } = fakeSupabase((q) => {
      if (first(q) === "insert") return { error: UNIQUE };
      selects += 1;
      return { data: selects === 1 ? null : row({ slug: "winner" }) };
    });
    expect(await createCardFromDraft(client, USER, quickDraft())).toMatchObject({ ok: true, created: false, card: { slug: "winner" } });
  });

  it("reports unexpected database errors instead of throwing", async () => {
    const { client } = fakeSupabase((q) => (first(q) === "insert" ? { error: { message: "boom", code: "XX000" } } : { data: null }));
    expect(await createCardFromDraft(client, USER, quickDraft())).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe("saveOwnerCard", () => {
  it("rejects avatars outside the user's folder without touching the DB", async () => {
    const { client, queries } = fakeSupabase(() => ({}));
    const result = await saveOwnerCard(client, USER, { ...input, avatarPath: "someone-else/avatar.jpg" });
    expect(result).toEqual({ ok: false, errors: { avatarPath: expect.any(String) } });
    expect(queries).toHaveLength(0);
  });

  it("still saves the content when the design migration hasn't been applied", async () => {
    const missing = { message: "Could not find the 'detail_color' column of 'profiles' in the schema cache", code: "PGRST204" };
    let updates = 0;
    const { client, queries } = fakeSupabase((q) => {
      if (first(q) !== "update") return { data: row() };
      updates += 1;
      return updates === 1 ? { error: missing } : { data: row({ slug: "alex-new" }) };
    });
    const result = await saveOwnerCard(client, USER, input);
    // Saved, and the owner is told their new design didn't make it.
    expect(result).toMatchObject({ ok: true, designPending: true });
    const [withDesign, withoutDesign] = queries.filter((q) => first(q) === "update");
    expect(withDesign!.calls[0]![1][0]).toHaveProperty("pattern", "trama");
    expect(withoutDesign!.calls[0]![1][0]).not.toHaveProperty("pattern");
    expect(withoutDesign!.calls[0]![1][0]).toHaveProperty("slug", "alex-new");
  });

  it("drops only what a database without the redesign migration can't store", async () => {
    // First the unknown typeface column, then the motif the old check rejects.
    const errors = [
      { message: "Could not find the 'typeface' column of 'profiles' in the schema cache", code: "PGRST204" },
      { message: 'new row for relation "profiles" violates check constraint "profiles_pattern_kind"', code: "23514" },
    ];
    let updates = 0;
    const { client, queries } = fakeSupabase((q) => {
      if (first(q) !== "update") return { data: row() };
      updates += 1;
      return updates <= errors.length ? { error: errors[updates - 1] } : { data: row({ slug: "alex-new" }) };
    });
    expect(await saveOwnerCard(client, USER, input)).toMatchObject({ ok: true, designPending: true });
    const payloads = queries.filter((q) => first(q) === "update").map((q) => q.calls[0]![1][0] as Record<string, unknown>);
    expect(payloads).toHaveLength(3);
    expect(payloads[0]).toMatchObject({ pattern: "trama", typeface: "moderna" });
    expect(payloads[1]).not.toHaveProperty("typeface");
    expect(payloads[1]).toHaveProperty("pattern", "trama");
    expect(payloads[2]).not.toHaveProperty("pattern");
    expect(payloads[2]).toMatchObject({ pattern_seed: 77, detail_color: null, slug: "alex-new" });
  });

  it("doesn't retry other check violations", async () => {
    const violation = { message: 'violates check constraint "profiles_slug_format"', code: "23514" };
    const { client, queries } = fakeSupabase((q) => (first(q) === "update" ? { error: violation } : { data: row() }));
    expect(await saveOwnerCard(client, USER, input)).toMatchObject({ ok: false });
    expect(queries.filter((q) => first(q) === "update")).toHaveLength(1);
  });

  it("maps the slug-change limit to a slug error", async () => {
    const limit = { message: "slug change limit reached for 1111", code: "23514" };
    const { client } = fakeSupabase((q) => (first(q) === "update" ? { error: limit } : { data: row() }));
    const result = await saveOwnerCard(client, USER, input);
    expect(result).toMatchObject({ ok: false, errors: { slug: expect.stringMatching(/demasiadas veces/) } });
  });

  it("saves the contact-form switch, and drops it while its migration is pending", async () => {
    const missing = { message: "Could not find the 'accepts_contact_requests' column of 'profiles' in the schema cache", code: "PGRST204" };
    let updates = 0;
    const { client, queries } = fakeSupabase((q) => {
      if (first(q) !== "update") return { data: row() };
      updates += 1;
      return updates === 1 ? { error: missing } : { data: row() };
    });
    expect(await saveOwnerCard(client, USER, { ...input, acceptsContactRequests: true })).toMatchObject({ ok: true, designPending: true });
    const payloads = queries.filter((q) => first(q) === "update").map((q) => q.calls[0]![1][0] as Record<string, unknown>);
    expect(payloads[0]).toHaveProperty("accepts_contact_requests", true);
    expect(payloads[1]).not.toHaveProperty("accepts_contact_requests");
    expect(payloads[1]).toHaveProperty("typeface", "moderna");

    // Older editor tabs don't send the field at all: leave the stored value alone.
    const old = fakeSupabase((q) => (first(q) === "update" ? { data: row() } : { data: row() }));
    await saveOwnerCard(old.client, USER, input);
    expect(old.queries.find((q) => first(q) === "update")!.calls[0]![1][0]).not.toHaveProperty("accepts_contact_requests");
  });

  it("tells callers whether anything changed", async () => {
    const same = fakeSupabase(() => ({ data: row() }));
    expect(await saveOwnerCard(same.client, USER, input)).toMatchObject({ ok: true, changed: false });
    const edited = fakeSupabase((q) => ({ data: first(q) === "update" ? row({ updated_at: "2026-09-29T00:00:00Z" }) : row() }));
    expect(await saveOwnerCard(edited.client, USER, input)).toMatchObject({ ok: true, changed: true });
  });

  it("maps a unique violation to a slug error", async () => {
    const { client } = fakeSupabase((q) => (first(q) === "update" ? { error: UNIQUE } : { data: row() }));
    expect(await saveOwnerCard(client, USER, input)).toEqual({ ok: false, errors: { slug: "Ese enlace ya está cogido." } });
  });

  it("reports slug and avatar changes so callers can revalidate and clean up", async () => {
    const newAvatar = `${USER}/avatar-2.jpg`;
    const { client, queries } = fakeSupabase((q) =>
      first(q) === "update"
        ? { data: row({ slug: "alex-new", avatar_path: newAvatar }) }
        : { data: row({ avatar_path: `${USER}/avatar-1.jpg` }) },
    );
    const result = await saveOwnerCard(client, USER, { ...input, avatarPath: newAvatar });
    expect(result).toMatchObject({
      ok: true,
      slugChanged: true,
      previousSlug: "alex",
      previousAvatarPath: `${USER}/avatar-1.jpg`,
      designPending: false,
    });
    const update = queries.find((q) => first(q) === "update")!;
    expect(has(update, "eq", "id", USER)).toBe(true);
  });

  it("fails gracefully when the profile is missing or the update errors", async () => {
    const missing = fakeSupabase(() => ({ data: null }));
    expect(await saveOwnerCard(missing.client, USER, input)).toMatchObject({ ok: false, errors: { _form: expect.any(String) } });
    const broken = fakeSupabase((q) => (first(q) === "update" ? { error: { message: "down" } } : { data: row() }));
    expect(await saveOwnerCard(broken.client, USER, input)).toMatchObject({ ok: false, errors: { _form: expect.any(String) } });
  });
});

describe("stats and slug availability", () => {
  it("parses the stats RPC defensively", async () => {
    const { client } = fakeSupabase(() => ({
      data: {
        days: 30,
        views: "7",
        qr_views: 3,
        vcard_downloads: 2,
        wallet_adds: 1,
        link_clicks: { "l-email-1": 4 },
        daily_views: [{ day: "2026-09-20", count: 7 }, "junk"],
      },
    }));
    expect(await getOwnStats(client)).toEqual({
      days: 30,
      views: 7,
      qrViews: 3,
      vcardDownloads: 2,
      walletAdds: 1,
      linkClicks: { "l-email-1": 4 },
      dailyViews: [{ day: "2026-09-20", count: 7 }],
    });
    const failing = fakeSupabase(() => ({ error: { message: "nope" } }));
    expect((await getOwnStats(failing.client)).views).toBe(0);
  });

  it("follows renamed handles only when Supabase answers with a valid one", async () => {
    expect(await resolveSlugRedirect("old-handle")).toBeNull(); // no Supabase in tests
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const fetchMock = vi.fn(async () => Response.json("new-handle"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolveSlugRedirect("Old-Handle-2")).toBe("new-handle");
    expect(await resolveSlugRedirect("../x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json("javascript:alert(1)")));
    expect(await resolveSlugRedirect("old-handle-3")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("checks slug availability through the RPC", async () => {
    const { client, queries } = fakeSupabase(() => ({ data: false }));
    expect(await isSlugAvailable(client, "taken")).toBe(false);
    expect(queries[0]!.table).toBe("rpc:is_slug_available");
  });
});

describe("wallet data", () => {
  it("returns null for non-uuid serials without querying", async () => {
    const { client, queries } = fakeSupabase(() => ({}));
    expect(await getCardById(client, "not-a-uuid")).toBeNull();
    expect(await verifyApplePassToken(client, "not-a-uuid", "x".repeat(32))).toBe(false);
    expect(queries).toHaveLength(0);
  });

  it("reuses, creates, or re-reads the Apple auth token", async () => {
    const existing = fakeSupabase(() => ({ data: { apple_auth_token: "a".repeat(64) } }));
    expect(await ensureApplePassToken(existing.client, USER)).toBe("a".repeat(64));

    let created = "";
    const fresh = fakeSupabase((q) => {
      if (first(q) === "upsert") {
        created = (q.calls[0]![1][0] as { apple_auth_token: string }).apple_auth_token;
        return { data: { apple_auth_token: created } };
      }
      return { data: null };
    });
    expect(await ensureApplePassToken(fresh.client, USER)).toMatch(/^[0-9a-f]{64}$/);
    expect(created).toMatch(/^[0-9a-f]{64}$/);

    let reads = 0;
    const raced = fakeSupabase((q) => {
      if (first(q) === "upsert") return { data: null }; // ignoreDuplicates → no row
      reads += 1;
      return { data: reads === 1 ? null : { apple_auth_token: "w".repeat(64) } };
    });
    expect(await ensureApplePassToken(raced.client, USER)).toBe("w".repeat(64));
  });

  it("compares Apple auth tokens exactly", async () => {
    const { client } = fakeSupabase(() => ({ data: { apple_auth_token: "a".repeat(64) } }));
    expect(await verifyApplePassToken(client, USER, "a".repeat(64))).toBe(true);
    expect(await verifyApplePassToken(client, USER, "b".repeat(64))).toBe(false);
    expect(await verifyApplePassToken(client, USER, "a".repeat(63))).toBe(false);
    expect(await verifyApplePassToken(client, USER, null)).toBe(false);
  });

  it("tells new registrations apart from refreshed ones", async () => {
    const key = { deviceLibraryId: "device1", passTypeId: "pass.app.passme", serial: USER };
    const fresh = fakeSupabase(() => ({ data: null }));
    expect(await registerDevice(fresh.client, key, "ab".repeat(32))).toBe(true);
    const known = fakeSupabase((q) => (first(q) === "select" ? { data: { push_token: "old" } } : {}));
    expect(await registerDevice(known.client, key, "ab".repeat(32))).toBe(false);
    const broken = fakeSupabase(() => ({ error: { message: "down" } }));
    await expect(unregisterDevice(broken.client, key)).rejects.toThrow(/down/);
  });

  it("lists only passes updated after the tag, with the newest timestamp", async () => {
    const other = "22222222-2222-4222-8222-222222222222";
    const { client } = fakeSupabase((q) =>
      q.table === "apple_pass_registrations"
        ? { data: [{ serial_number: USER }, { serial_number: other }] }
        : {
            data: [
              { id: USER, updated_at: "2026-09-10T10:00:00.000Z" },
              { id: other, updated_at: "2026-09-12T10:00:00.500Z" },
            ],
          },
    );
    const since = String(Date.parse("2026-09-11T00:00:00Z"));
    expect(await listUpdatedSerials(client, "device1", "pass.app.passme", since)).toEqual({
      serialNumbers: [other],
      lastUpdated: String(Date.parse("2026-09-12T10:00:00.500Z")),
    });
    expect((await listUpdatedSerials(client, "device1", "pass.app.passme", null))?.serialNumbers).toHaveLength(2);
    expect(await listUpdatedSerials(client, "device1", "pass.app.passme", String(Date.parse("2027-01-01")))).toBeNull();

    const none = fakeSupabase(() => ({ data: [] }));
    expect(await listUpdatedSerials(none.client, "device1", "pass.app.passme", null)).toBeNull();
  });

  it("dedupes push tokens and skips empty cleanups", async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [{ push_token: "a" }, { push_token: "a" }, { push_token: "b" }] }));
    expect(await getPushTokensForSerial(client, "pass.app.passme", USER)).toEqual(["a", "b"]);
    await deleteRegistrationsForPushTokens(client, "pass.app.passme", []);
    expect(queries).toHaveLength(1);
  });
});
