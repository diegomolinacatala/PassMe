import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asRole, createTestDatabase } from "./supabase-stub";

/** 20261006120000_owner_timezone_meeting_settings.sql runs for real (PGlite + Supabase stubs). */

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MIGRATION = "20261006120000_owner_timezone_meeting_settings.sql";

let db: PGlite;

async function publicCard(slug: string) {
  const { rows } = await asRole(db, "anon", null, () =>
    db.query<{ card: Record<string, unknown> | null }>(`select public.get_public_card($1) as card`, [slug]),
  );
  return rows[0]!.card;
}

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query(`insert into auth.users (id) values ($1)`, [ANA]);
  await db.query(`insert into public.profiles (id, slug, full_name, is_published) values ($1, 'ana', 'Ana Ruiz', true)`, [ANA]);
});

describe("owner time zone and meeting settings", () => {
  it("defaults to Madrid and empty settings (the app reads '{}' as its defaults)", async () => {
    const { rows } = await db.query<{ time_zone: string; meeting_settings: unknown }>(
      `select time_zone, meeting_settings from public.profiles where id = $1`,
      [ANA],
    );
    expect(rows[0]).toEqual({ time_zone: "Europe/Madrid", meeting_settings: {} });
  });

  it("publishes the zone and the rules, never the private video link or place", async () => {
    await db.query(`update public.profiles set time_zone = 'Atlantic/Canary', meeting_settings = $2::jsonb where id = $1`, [
      ANA,
      JSON.stringify({ formats: ["video"], weekdays: [1, 2], start: "09:00", end: "14:00", duration: 45, noticeMinutes: 120, videoLink: "https://meet.google.com/abc-defg-hij", place: "Mi oficina" }),
    ]);
    const card = await publicCard("ana");
    expect(card).toMatchObject({ time_zone: "Atlantic/Canary", meeting_rules: { formats: ["video"], weekdays: [1, 2], end: "14:00", duration: 45 } });
    expect(JSON.stringify(card)).not.toContain("meet.google.com");
    expect(JSON.stringify(card)).not.toContain("Mi oficina");
  });

  it("rejects malformed zones and settings", async () => {
    await expect(db.query(`update public.profiles set time_zone = 'Europe/Madrid; drop' where id = $1`, [ANA])).rejects.toThrow(/profiles_time_zone_format/);
    await expect(db.query(`update public.profiles set time_zone = '' where id = $1`, [ANA])).rejects.toThrow(/profiles_time_zone_format/);
    await expect(db.query(`update public.profiles set meeting_settings = '[]'::jsonb where id = $1`, [ANA])).rejects.toThrow(/profiles_meeting_settings_shape/);
    await expect(
      db.query(`update public.profiles set meeting_settings = jsonb_build_object('place', repeat('x', 3000)) where id = $1`, [ANA]),
    ).rejects.toThrow(/profiles_meeting_settings_shape/);
    for (const zone of ["UTC", "America/Argentina/Buenos_Aires", "Etc/GMT+3"]) {
      await db.query(`update public.profiles set time_zone = $2 where id = $1`, [ANA, zone]);
    }
  });

  it("keeps the public read function closed to direct table access", async () => {
    const { rows } = await db.query<{ anon: boolean }>(
      `select has_function_privilege('anon', 'public.get_public_card(text)', 'execute') as anon`,
    );
    expect(rows[0]!.anon).toBe(true);
    await expect(asRole(db, "anon", null, () => db.query(`select meeting_settings from public.profiles`))).rejects.toThrow();
  });

  it("without the migration the public card keeps its old shape (the app's fallback)", async () => {
    const before = await createTestDatabase({ before: MIGRATION });
    await before.query(`insert into auth.users (id) values ($1)`, [ANA]);
    await before.query(`insert into public.profiles (id, slug, full_name, is_published) values ($1, 'ana', 'Ana Ruiz', true)`, [ANA]);
    const { rows } = await asRole(before, "anon", null, () =>
      before.query<{ card: Record<string, unknown> }>(`select public.get_public_card('ana') as card`),
    );
    expect(rows[0]!.card).not.toHaveProperty("time_zone");
    expect(rows[0]!.card).not.toHaveProperty("meeting_rules");
  });
});
