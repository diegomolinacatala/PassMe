import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_CARD } from "@/lib/card/demo";
import type { ValidCardInput } from "@/lib/card/schema";
import {
  getOrCreateOwnerCard,
  getOwnStats,
  getPublicCard,
  isSlugAvailable,
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
    pattern: "ondas",
    pattern_seed: 123,
    avatar_path: null,
    links: [
      { id: "l-email-1", kind: "email", value: "alex@example.com", visible: true },
      { id: "l-phone-1", kind: "phone", value: "+34 600 000 000", visible: false },
      { id: "bad", kind: "email", value: "x", visible: true },
    ],
    is_published: true,
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
  pattern: "senal",
  patternSeed: 77,
  avatarPath: null,
  isPublished: true,
  links: [],
};

afterEach(() => vi.unstubAllEnvs());

describe("row mapping", () => {
  it("normalizes colors, drops invalid links and hides hidden ones publicly", () => {
    const card = rowToOwnerCard(row({ accent_color: "nonsense" }));
    expect(card.accentColor).toBe("#EF7A4A");
    expect(card).toMatchObject({ detailColor: "#FFE3D1", pattern: "ondas", patternSeed: 123 });

    const odd = rowToOwnerCard(row({ detail_color: "lime", pattern: "tartan", pattern_seed: -4 }));
    expect(odd).toMatchObject({ detailColor: null, pattern: "sello", patternSeed: 0 });
    expect(card.links.map((l) => l.id)).toEqual(["l-email-1", "l-phone-1"]);
    expect(toPublicCard(card).links.map((l) => l.id)).toEqual(["l-email-1"]);
  });
});

describe("getPublicCard", () => {
  it("serves the demo card without Supabase and nothing else", async () => {
    expect((await getPublicCard("DEMO"))?.fullName).toBe(DEMO_CARD.fullName);
    expect(await getPublicCard("alex")).toBeNull();
    expect(await getPublicCard("../../etc")).toBeNull();
  });
});

describe("getOrCreateOwnerCard", () => {
  it("returns the existing profile", async () => {
    const { client, queries } = fakeSupabase(() => ({ data: row() }));
    const card = await getOrCreateOwnerCard(client, { id: USER, email: "alex@example.com" });
    expect(card.slug).toBe("alex");
    expect(queries).toHaveLength(1);
  });

  it("creates a draft with a slug derived from the email", async () => {
    let inserted: Record<string, unknown> | null = null;
    const { client } = fakeSupabase((q) => {
      if (first(q) === "insert") {
        inserted = q.calls[0]![1][0] as Record<string, unknown>;
        return { data: row({ slug: inserted.slug as string, full_name: "" }) };
      }
      return { data: null };
    });
    const card = await getOrCreateOwnerCard(client, { id: USER, email: "Jose.Nunez@example.com" });
    expect(inserted).toMatchObject({ id: USER, accent_color: "#EF7A4A", detail_color: "#FFE3D1", pattern: "sello" });
    expect((inserted as unknown as { pattern_seed: number }).pattern_seed).toBeGreaterThanOrEqual(0);
    expect(card.slug).toMatch(/^jose-nunez-[0-9a-f]{6}$/);
  });

  it("creates cards on databases without the design migration", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const { client } = fakeSupabase((q) => {
      if (first(q) !== "insert") return { data: null };
      payloads.push(q.calls[0]![1][0] as Record<string, unknown>);
      return payloads.length === 1
        ? { error: { message: "column \"detail_color\" of relation \"profiles\" does not exist", code: "42703" } }
        : { data: row() };
    });
    const card = await getOrCreateOwnerCard(client, { id: USER, email: "alex@example.com" });
    expect(card.id).toBe(USER);
    expect(payloads[0]).toHaveProperty("pattern_seed");
    expect(payloads[1]).not.toHaveProperty("pattern_seed");
    expect(payloads[1]!.slug).toBe(payloads[0]!.slug);
  });

  it("retries on slug collisions and survives a parallel insert", async () => {
    let inserts = 0;
    let selects = 0;
    const { client } = fakeSupabase((q) => {
      if (first(q) === "insert") {
        inserts += 1;
        return { error: UNIQUE };
      }
      selects += 1;
      // First lookup: nothing. After two collisions another request wins the race.
      return { data: selects >= 3 ? row({ slug: "winner" }) : null };
    });
    const card = await getOrCreateOwnerCard(client, { id: USER, email: null });
    expect(card.slug).toBe("winner");
    expect(inserts).toBe(2);
  });

  it("throws on unexpected database errors", async () => {
    const { client } = fakeSupabase((q) => (first(q) === "insert" ? { error: { message: "boom", code: "XX000" } } : {}));
    await expect(getOrCreateOwnerCard(client, { id: USER, email: null })).rejects.toThrow(/boom/);
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
    expect(result).toMatchObject({ ok: true });
    const [withDesign, withoutDesign] = queries.filter((q) => first(q) === "update");
    expect(withDesign!.calls[0]![1][0]).toHaveProperty("pattern", "senal");
    expect(withoutDesign!.calls[0]![1][0]).not.toHaveProperty("pattern");
    expect(withoutDesign!.calls[0]![1][0]).toHaveProperty("slug", "alex-new");
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
    expect(result).toMatchObject({ ok: true, slugChanged: true, previousSlug: "alex", previousAvatarPath: `${USER}/avatar-1.jpg` });
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
