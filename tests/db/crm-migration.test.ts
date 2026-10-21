import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, asRole, createTestDatabase } from "./supabase-stub";

/**
 * 20261021120000_crm_insights.sql runs for real (PGlite + Supabase stubs):
 * device and country on card events, and who brought each new card.
 */

const MIGRATION = "20261021120000_crm_insights.sql";
const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARLOS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const links = JSON.stringify([
  { id: "l-email-1", kind: "email", value: "ana@example.com", visible: true },
  { id: "l-phone-1", kind: "phone", value: "+34 600 000 000", visible: false },
]);

let db: PGlite;

beforeAll(async () => {
  // An event recorded before the migration, to check old rows survive it.
  db = await createTestDatabase({ before: MIGRATION });
  await db.query(`insert into auth.users (id) values ($1), ($2), ($3)`, [ANA, BEA, CARLOS]);
  await db.query(
    `insert into public.profiles (id, slug, full_name, links) values
       ($1, 'ana', 'Ana Ruiz', $4::jsonb), ($2, 'bea', 'Bea Gil', '[]'::jsonb), ($3, 'carlos', 'Carlos Paz', '[]'::jsonb)`,
    [ANA, BEA, CARLOS, links],
  );
  await db.query(`insert into public.profile_events (profile_id, kind, source) values ($1, 'view', 'qr')`, [BEA]);
  await applyMigrations(db, (file) => file === MIGRATION);
}, 60_000);

describe("the migration", () => {
  it("can be pasted twice in the SQL Editor without failing", async () => {
    await expect(applyMigrations(db, (file) => file === MIGRATION)).resolves.toBeUndefined();
  });
});

describe("record_card_event_v2", () => {
  const record = (slug: string, kind: string, linkId: string | null, platform: string | null, country: string | null) =>
    asRole(db, "service_role", null, () =>
      db.query<{ ok: boolean }>(`select public.record_card_event_v2($1, $2, 'qr', $3, $4, $5) as ok`, [slug, kind, linkId, platform, country]),
    );

  it("stores the visitor's kind of device and country with the event", async () => {
    expect((await record("ANA", "view", null, "ios", "ES")).rows[0]!.ok).toBe(true);
    expect((await record("ana", "vcard", null, "android", "PT")).rows[0]!.ok).toBe(true);
    const { rows } = await db.query<{ kind: string; platform: string; country: string }>(
      `select kind, platform, country from public.profile_events where profile_id = $1 order by id`,
      [ANA],
    );
    expect(rows).toEqual([
      { kind: "view", platform: "ios", country: "ES" },
      { kind: "vcard", platform: "android", country: "PT" },
    ]);
  });

  it("stores anything else as unknown instead of failing", async () => {
    expect((await record("carlos", "view", null, "windows-phone", "es")).rows[0]!.ok).toBe(true);
    expect((await record("carlos", "view", null, null, "ESP")).rows[0]!.ok).toBe(true);
    const { rows } = await db.query<{ platform: string | null; country: string | null }>(
      `select platform, country from public.profile_events where profile_id = $1`,
      [CARLOS],
    );
    expect(rows).toEqual([
      { platform: null, country: null },
      { platform: null, country: null },
    ]);
  });

  it("still only counts clicks on visible links of published cards", async () => {
    expect((await record("ana", "link_click", "l-email-1", "ios", "ES")).rows[0]!.ok).toBe(true);
    expect((await record("ana", "link_click", "l-phone-1", "ios", "ES")).rows[0]!.ok).toBe(false);
    expect((await record("nobody", "view", null, "ios", "ES")).rows[0]!.ok).toBe(false);
  });

  it("keeps the events recorded before the migration, without the new data", async () => {
    const { rows } = await db.query<{ platform: string | null; country: string | null }>(
      `select platform, country from public.profile_events where profile_id = $1`,
      [BEA],
    );
    expect(rows).toEqual([{ platform: null, country: null }]);
  });

  it("rejects bad values written directly", async () => {
    await expect(db.query(`insert into public.profile_events (profile_id, kind, platform) values ($1, 'view', 'mac')`, [ANA])).rejects.toThrow(
      /profile_events_platform/,
    );
    await expect(db.query(`insert into public.profile_events (profile_id, kind, country) values ($1, 'view', 'es')`, [ANA])).rejects.toThrow(
      /profile_events_country/,
    );
  });

  it("is not callable from the browser", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        asRole(db, role, ANA, () => db.query(`select public.record_card_event_v2('ana', 'view', 'qr', null, 'ios', 'ES')`)),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe("profile_referrals", () => {
  it("is invisible and untouchable from the browser", async () => {
    await db.query(`insert into public.profile_referrals (profile_id, referrer_id, via) values ($1, $2, 'qr')`, [BEA, ANA]);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(asRole(db, role, BEA, () => db.query(`select * from public.profile_referrals`))).rejects.toThrow(/permission denied/);
      await expect(
        asRole(db, role, CARLOS, () => db.query(`insert into public.profile_referrals (profile_id, referrer_id) values ($1, $2)`, [CARLOS, ANA])),
      ).rejects.toThrow(/permission denied/);
    }
    const { rows } = await asRole(db, "service_role", null, () => db.query(`select profile_id from public.profile_referrals`));
    expect(rows).toHaveLength(1);
  });

  it("refuses a card referring itself and unknown ways of arriving", async () => {
    await expect(db.query(`insert into public.profile_referrals (profile_id, referrer_id) values ($1, $1)`, [CARLOS])).rejects.toThrow(
      /profile_referrals_not_self/,
    );
    await expect(db.query(`insert into public.profile_referrals (profile_id, via) values ($1, 'email')`, [CARLOS])).rejects.toThrow(
      /profile_referrals_via/,
    );
  });

  it("forgets the referrer when they delete their account, and the row when the newcomer does", async () => {
    await db.query(`insert into public.profile_referrals (profile_id, referrer_id, via) values ($1, $2, 'share')`, [CARLOS, BEA]);
    await db.query(`delete from auth.users where id = $1`, [ANA]);
    const afterReferrer = await db.query<{ profile_id: string; referrer_id: string | null }>(
      `select profile_id, referrer_id from public.profile_referrals order by profile_id`,
    );
    expect(afterReferrer.rows).toEqual([
      { profile_id: BEA, referrer_id: null },
      { profile_id: CARLOS, referrer_id: BEA },
    ]);
    await db.query(`delete from auth.users where id = $1`, [CARLOS]);
    const afterNewcomer = await db.query(`select profile_id from public.profile_referrals`);
    expect(afterNewcomer.rows).toEqual([{ profile_id: BEA }]);
  });
});
