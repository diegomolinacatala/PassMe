import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, asRole, createTestDatabase } from "./supabase-stub";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

const aliceLinks = JSON.stringify([
  { id: "l-email-1", kind: "email", value: "alice@example.com", visible: true },
  { id: "l-phone-1", kind: "phone", value: "+34 600 000 000", visible: false },
  { id: "l-web-111", kind: "website", value: "https://example.com", visible: true },
]);

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query(`insert into auth.users (id, email) values ($1, 'alice@example.com'), ($2, 'bob@example.com')`, [
    ALICE,
    BOB,
  ]);
  await db.query(
    `insert into public.profiles (id, slug, full_name, headline, links, avatar_path)
     values ($1, 'alice', 'Alice Doe', 'Engineer', $2::jsonb, $3),
            ($4, 'bob-draft', '', '', '[]'::jsonb, null)`,
    [ALICE, aliceLinks, `${ALICE}/avatar.jpg`, BOB],
  );
}, 60_000);

describe("profiles constraints", () => {
  it.each([
    ["Upper", "format"],
    ["a", "length"],
    ["double--dash", "format"],
    ["dashboard", "reserved"],
    ["demo", "reserved"],
  ])("rejects slug %s (%s)", async (slug) => {
    await expect(
      db.query(`update public.profiles set slug = $1 where id = $2`, [slug, ALICE]),
    ).rejects.toThrow(/profiles_slug/);
  });

  it("rejects avatars outside the owner's folder or with traversal", async () => {
    for (const path of [`${BOB}/x.jpg`, `${ALICE}/../x.jpg`, `${ALICE}/a/b.jpg`, `${ALICE}/x.gif`]) {
      await expect(
        db.query(`update public.profiles set avatar_path = $1 where id = $2`, [path, ALICE]),
      ).rejects.toThrow(/profiles_avatar_path_owner/);
    }
  });

  it("gives new cards the brand design and their own variation", async () => {
    const { rows } = await db.query<{ accent_color: string; detail_color: string | null; pattern: string; pattern_seed: number; typeface: string }>(
      `select accent_color, detail_color, pattern, pattern_seed, typeface from public.profiles where id = $1`,
      [BOB],
    );
    expect(rows[0]).toMatchObject({ accent_color: "#EF7A4A", detail_color: null, pattern: "orbitas", typeface: "clasica" });
    expect(rows[0]!.pattern_seed).toBeGreaterThanOrEqual(0);
    expect(rows[0]!.pattern_seed).toBeLessThanOrEqual(999999);
  });

  it("validates the design columns", async () => {
    await expect(db.query(`update public.profiles set detail_color = 'lime' where id = $1`, [ALICE])).rejects.toThrow(
      /profiles_detail_color_format/,
    );
    await expect(db.query(`update public.profiles set pattern = 'tartan' where id = $1`, [ALICE])).rejects.toThrow(
      /profiles_pattern_kind/,
    );
    await expect(db.query(`update public.profiles set pattern_seed = 1000000 where id = $1`, [ALICE])).rejects.toThrow(
      /profiles_pattern_seed_range/,
    );
    await expect(db.query(`update public.profiles set typeface = 'comic' where id = $1`, [ALICE])).rejects.toThrow(
      /profiles_typeface/,
    );
    const ok = await db.query(
      `update public.profiles set detail_color = '#FFE3D1', pattern = 'relieve', pattern_seed = 48213, typeface = 'editorial' where id = $1`,
      [ALICE],
    );
    expect(ok.affectedRows).toBe(1);
  });

  it("rejects non-array or oversized links", async () => {
    await expect(
      db.query(`update public.profiles set links = '{}'::jsonb where id = $1`, [ALICE]),
    ).rejects.toThrow(/profiles_links_shape/);
    const many = JSON.stringify(Array.from({ length: 21 }, (_, i) => ({ id: `x${i}` })));
    await expect(
      db.query(`update public.profiles set links = $1::jsonb where id = $2`, [many, ALICE]),
    ).rejects.toThrow(/profiles_links_shape/);
  });

  it("bumps updated_at on update", async () => {
    const before = await db.query<{ updated_at: Date }>(`select updated_at from public.profiles where id = $1`, [ALICE]);
    await new Promise((r) => setTimeout(r, 5));
    await db.query(`update public.profiles set headline = 'Staff Engineer' where id = $1`, [ALICE]);
    const after = await db.query<{ updated_at: Date }>(`select updated_at from public.profiles where id = $1`, [ALICE]);
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
  });
});

describe("row level security", () => {
  it("hides the profiles table from anonymous visitors", async () => {
    await expect(asRole(db, "anon", null, () => db.query(`select * from public.profiles`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("lets owners read only their own profile", async () => {
    const rows = await asRole(db, "authenticated", ALICE, () =>
      db.query<{ slug: string }>(`select slug from public.profiles`),
    );
    expect(rows.rows.map((r) => r.slug)).toEqual(["alice"]);
  });

  it("prevents updating someone else's profile", async () => {
    const result = await asRole(db, "authenticated", BOB, () =>
      db.query(`update public.profiles set full_name = 'Hacked' where id = $1`, [ALICE]),
    );
    expect(result.affectedRows).toBe(0);
  });

  it("prevents creating a profile for another user", async () => {
    await expect(
      asRole(db, "authenticated", BOB, () =>
        db.query(`insert into public.profiles (id, slug) values ($1, 'alice-2')`, [ALICE]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("keeps wallet secrets server-only", async () => {
    await db.query(`insert into public.wallet_pass_secrets (profile_id) values ($1)`, [ALICE]);
    await expect(asRole(db, "anon", null, () => db.query(`select * from public.wallet_pass_secrets`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asRole(db, "authenticated", ALICE, () => db.query(`select * from public.wallet_pass_secrets`)),
    ).rejects.toThrow(/permission denied/);
    const server = await asRole(db, "service_role", null, () =>
      db.query<{ apple_auth_token: string }>(`select apple_auth_token from public.wallet_pass_secrets`),
    );
    expect(server.rows[0].apple_auth_token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("restricts avatar uploads to the user's own folder", async () => {
    await expect(
      asRole(db, "authenticated", BOB, () =>
        db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${ALICE}/evil.jpg`]),
      ),
    ).rejects.toThrow(/row-level security/);
    const ok = await asRole(db, "authenticated", BOB, () =>
      db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${BOB}/avatar.jpg`]),
    );
    expect(ok.affectedRows).toBe(1);
  });
});

describe("get_public_card", () => {
  it("returns published cards without hidden links", async () => {
    const result = await asRole(db, "anon", null, () =>
      db.query<{ card: Record<string, unknown> }>(`select public.get_public_card('ALICE') as card`),
    );
    const card = result.rows[0].card as { full_name: string; links: Array<{ id: string }> };
    expect(card.full_name).toBe("Alice Doe");
    expect(card.links.map((l) => l.id)).toEqual(["l-email-1", "l-web-111"]);
    expect(JSON.stringify(card)).not.toContain("600 000 000");
    expect(card).not.toHaveProperty("id");
    expect(card).toHaveProperty("pattern");
    expect(card).toHaveProperty("pattern_seed");
    expect(card).toHaveProperty("detail_color");
    expect(card).toHaveProperty("typeface");
  });

  it("returns null for drafts, unpublished and unknown slugs", async () => {
    await db.query(`update public.profiles set is_published = false where id = $1`, [ALICE]);
    const rows = await asRole(db, "anon", null, () =>
      db.query<{ a: unknown; b: unknown; c: unknown }>(
        `select public.get_public_card('alice') as a, public.get_public_card('bob-draft') as b,
                public.get_public_card('nobody') as c`,
      ),
    );
    await db.query(`update public.profiles set is_published = true where id = $1`, [ALICE]);
    expect(rows.rows[0]).toEqual({ a: null, b: null, c: null });
  });
});

describe("is_slug_available", () => {
  it("treats the caller's own slug as available", async () => {
    const rows = await asRole(db, "authenticated", ALICE, () =>
      db.query<{ own: boolean; taken: boolean; free: boolean }>(
        `select public.is_slug_available('alice') as own, public.is_slug_available('bob-draft') as taken,
                public.is_slug_available('fresh-slug') as free`,
      ),
    );
    expect(rows.rows[0]).toEqual({ own: true, taken: false, free: true });
  });

  it("is not callable anonymously", async () => {
    await expect(
      asRole(db, "anon", null, () => db.query(`select public.is_slug_available('x')`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("get_card_stats", () => {
  it("aggregates only the caller's events", async () => {
    await db.query(
      `insert into public.profile_events (profile_id, kind, source, link_id) values
        ($1, 'view', 'qr', null), ($1, 'view', 'direct', null), ($1, 'vcard', 'direct', null),
        ($1, 'link_click', 'direct', 'l-email-1'), ($1, 'link_click', 'direct', 'l-email-1'),
        ($1, 'pass_apple', 'direct', null), ($2, 'view', 'direct', null)`,
      [ALICE, BOB],
    );
    const rows = await asRole(db, "authenticated", ALICE, () =>
      db.query<{ stats: Record<string, unknown> }>(`select public.get_card_stats(30) as stats`),
    );
    const stats = rows.rows[0].stats;
    expect(stats).toMatchObject({
      days: 30,
      views: 2,
      qr_views: 1,
      vcard_downloads: 1,
      wallet_adds: 1,
      link_clicks: { "l-email-1": 2 },
    });
    expect(stats.daily_views).toHaveLength(1);
  });

  it("rejects unknown event kinds and sources", async () => {
    await expect(
      db.query(`insert into public.profile_events (profile_id, kind) values ($1, 'hack')`, [ALICE]),
    ).rejects.toThrow(/profile_events_kind/);
    await expect(
      db.query(`insert into public.profile_events (profile_id, kind, source) values ($1, 'view', 'x')`, [ALICE]),
    ).rejects.toThrow(/profile_events_source/);
  });

  it("does not let visitors read events", async () => {
    await expect(asRole(db, "anon", null, () => db.query(`select * from public.profile_events`))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("auth_otp_attempts", () => {
  it("only accepts sha-256 hashes and is server-only", async () => {
    await expect(
      db.query(`insert into public.auth_otp_attempts (email_hash) values ('alice@example.com')`),
    ).rejects.toThrow(/auth_otp_attempts_hash_format/);
    await db.query(`insert into public.auth_otp_attempts (email_hash) values ($1)`, ["a".repeat(64)]);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        asRole(db, role, role === "anon" ? null : BOB, () => db.query(`select * from public.auth_otp_attempts`)),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe("privileges", () => {
  it("denies anonymous access to private tables even without RLS", async () => {
    for (const table of ["profiles", "wallet_pass_secrets", "apple_pass_registrations", "auth_otp_attempts"]) {
      await expect(asRole(db, "anon", null, () => db.query(`select 1 from public.${table}`)), table).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it("does not let signed-in users write analytics directly", async () => {
    await expect(
      asRole(db, "authenticated", BOB, () =>
        db.query(`insert into public.profile_events (profile_id, kind) values ($1, 'view')`, [BOB]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps stats private to signed-in owners", async () => {
    await expect(asRole(db, "anon", null, () => db.query(`select public.get_card_stats(30)`))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("pass redesign migration", () => {
  it("moves retired motifs to their successors and keeps accepting them during the rollout", async () => {
    const REDESIGN = "20260928180000_pass_redesign.sql";
    const old = await createTestDatabase({ before: REDESIGN });
    const users = [ALICE, BOB, "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];
    const patterns = ["sello", "senal", "ondas", "liso"];
    for (const [i, id] of users.entries()) {
      await old.query(`insert into auth.users (id) values ($1)`, [id]);
      await old.query(`insert into public.profiles (id, slug, pattern) values ($1, $2, $3)`, [id, `user-${i}`, patterns[i]]);
    }

    await applyMigrations(old, (file) => file >= REDESIGN);

    const { rows } = await old.query<{ slug: string; pattern: string; typeface: string }>(
      `select slug, pattern, typeface from public.profiles order by slug`,
    );
    expect(rows.map((r) => r.pattern)).toEqual(["orbitas", "orbitas", "cinta", "liso"]);
    expect(new Set(rows.map((r) => r.typeface))).toEqual(new Set(["clasica"]));
    // The previous app version still writes "sello" until it's redeployed.
    const legacy = await old.query(`update public.profiles set pattern = 'sello' where id = $1`, [ALICE]);
    expect(legacy.affectedRows).toBe(1);
    await old.close();
  }, 60_000);
});

describe("cascade deletes", () => {
  it("removes all card data when the auth user is deleted", async () => {
    await db.query(
      `insert into public.apple_pass_registrations (device_library_id, pass_type_id, serial_number, push_token)
       values ('device-1', 'pass.app.passme', $1, 'token')`,
      [ALICE],
    );
    await db.query(`delete from auth.users where id = $1`, [ALICE]);
    const counts = await db.query<Record<string, number>>(
      `select
        (select count(*)::int from public.profiles where id = $1) as profiles,
        (select count(*)::int from public.profile_events where profile_id = $1) as events,
        (select count(*)::int from public.wallet_pass_secrets where profile_id = $1) as secrets,
        (select count(*)::int from public.apple_pass_registrations where serial_number = $1) as regs`,
      [ALICE],
    );
    expect(counts.rows[0]).toEqual({ profiles: 0, events: 0, secrets: 0, regs: 0 });
  });
});
