import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, asRole, createTestDatabase } from "./supabase-stub";

/**
 * 20261017120000_security_audit.sql runs for real (PGlite + Supabase stubs).
 * Tests that care about rows that already exist build the database up to the
 * migration, insert the "old" data and then apply it.
 */

const MIGRATION = "20261017120000_security_audit.sql";
const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARLOS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const goodLinks = JSON.stringify([
  { id: "l-email-1", kind: "email", value: "ana@example.com", visible: true },
  { id: "l-web-0001", kind: "website", value: "https://example.com", label: "Mi web", visible: false },
]);

/** The database as production has it today: every migration but this one. */
async function databaseBefore(): Promise<PGlite> {
  return createTestDatabase({ before: MIGRATION });
}

async function applyThisMigration(db: PGlite): Promise<void> {
  await applyMigrations(db, (file) => file === MIGRATION);
}

async function addUsers(db: PGlite, ...ids: string[]): Promise<void> {
  for (const id of ids) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id.slice(0, 4)}@example.com`]);
}

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
  await addUsers(db, ANA, BEA, CARLOS);
  await db.query(
    `insert into public.profiles (id, slug, full_name, links, is_published, accepts_meeting_requests) values
       ($1, 'ana', 'Ana Ruiz', $4::jsonb, true, true),
       ($2, 'bea', 'Bea Gil', '[]'::jsonb, true, true),
       ($3, 'carlos', 'Carlos Paz', '[]'::jsonb, true, false)`,
    [ANA, BEA, CARLOS, goodLinks],
  );
}, 60_000);

// -----------------------------------------------------------------------------
describe("newly reserved handles", () => {
  const NEW_WORDS = [
    "soporte", "ayuda", "hola", "equipo", "seguridad", "getpassme", "oficial",
    "crear", "reunion", "privacidad", "terminos", "aviso-legal",
  ];
  const claim = (id: string, slug: string) =>
    asRole(db, "authenticated", id, () => db.query(`update public.profiles set slug = $1 where id = $2`, [slug, id]));

  it.each(NEW_WORDS)("refuses to move a card to %s", async (word) => {
    await expect(claim(CARLOS, word)).rejects.toThrow(/reserved/);
  });

  it("refuses anything that starts with passme-, but not a name that merely contains it", async () => {
    for (const slug of ["passme-soporte", "passme-x", "passme-pro-team"]) {
      await expect(claim(CARLOS, slug)).rejects.toThrow(/reserved/);
    }
    await claim(CARLOS, "passmeteam");
    await claim(CARLOS, "equipo-azul");
    await claim(CARLOS, "mi-passme");
    await claim(CARLOS, "carlos");
  });

  it("answers like a taken handle (unique violation), so the app's retry with a suffix works", async () => {
    await expect(claim(CARLOS, "hola")).rejects.toMatchObject({ code: "23505" });
  });

  it("refuses them on insert as well", async () => {
    const dan = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await addUsers(db, dan);
    await expect(
      asRole(db, "authenticated", dan, () => db.query(`insert into public.profiles (id, slug) values ($1, 'ayuda')`, [dan])),
    ).rejects.toThrow(/reserved/);
    await db.query(`delete from auth.users where id = $1`, [dan]);
  });

  it("is reflected by is_slug_available", async () => {
    const { rows } = await asRole(db, "authenticated", ANA, () =>
      db.query<Record<string, boolean>>(
        `select public.is_slug_available('soporte') as soporte, public.is_slug_available('passme-x') as prefixed,
                public.is_slug_available('Aviso-Legal') as legal, public.is_slug_available('fresh-handle') as free,
                public.is_slug_available('dashboard') as old_word`,
      ),
    );
    expect(rows[0]).toEqual({ soporte: false, prefixed: false, legal: false, free: true, old_word: false });
  });

  it("leaves the old reserved words to the CHECK, with its usual error", async () => {
    await expect(claim(CARLOS, "dashboard")).rejects.toThrow(/profiles_slug_not_reserved/);
  });

  it("lets owners who already use one keep it, edit their card and still see it available", async () => {
    const old = await databaseBefore();
    const owners = [
      ["11111111-0000-4000-8000-000000000001", "soporte"],
      ["11111111-0000-4000-8000-000000000002", "passme-pro"],
      ["11111111-0000-4000-8000-000000000003", "aviso-legal"],
    ] as const;
    for (const [id, slug] of owners) {
      await addUsers(old, id);
      await old.query(`insert into public.profiles (id, slug, full_name, is_published) values ($1, $2, 'Owner', true)`, [id, slug]);
    }

    await applyThisMigration(old); // must not fail on rows that already use these words

    for (const [id, slug] of owners) {
      const saved = await asRole(old, "authenticated", id, () =>
        old.query(`update public.profiles set headline = 'Sigo aquí', slug = $2 where id = $1`, [id, slug]),
      );
      expect(saved.affectedRows).toBe(1);
      const { rows } = await asRole(old, "authenticated", id, () =>
        old.query<{ ok: boolean }>(`select public.is_slug_available($1) as ok`, [slug]),
      );
      expect(rows[0]!.ok).toBe(true);
      const card = await asRole(old, "anon", null, () =>
        old.query<{ card: { slug: string } | null }>(`select public.get_public_card($1) as card`, [slug]),
      );
      expect(card.rows[0]!.card?.slug).toBe(slug);
    }
    // ...but nobody else can take one, and leaving it means not coming back.
    await expect(
      asRole(old, "authenticated", BEA, () => old.query(`insert into public.profiles (id, slug) values ($1, 'soporte')`, [BEA])),
    ).rejects.toThrow();
    await asRole(old, "authenticated", owners[0][0], () =>
      old.query(`update public.profiles set slug = 'soporte-tecnico' where id = $1`, [owners[0][0]]),
    );
    await expect(
      asRole(old, "authenticated", owners[0][0], () =>
        old.query(`update public.profiles set slug = 'soporte' where id = $1`, [owners[0][0]]),
      ),
    ).rejects.toThrow(/reserved/);
    await old.close();
  }, 60_000);
});

// -----------------------------------------------------------------------------
describe("avatars", () => {
  const upload = (uid: string, name: string) =>
    asRole(db, "authenticated", uid, () =>
      db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${uid}/${name}`]),
    );

  it("limits files to 1 MiB", async () => {
    const { rows } = await db.query<{ file_size_limit: string }>(`select file_size_limit from storage.buckets where id = 'avatars'`);
    expect(Number(rows[0]!.file_size_limit)).toBe(1_048_576);
  });

  it("stops a user at 20 files, frees a slot on delete, and counts each user on their own", async () => {
    for (let i = 0; i < 20; i += 1) await upload(BEA, `a${i}.jpg`);
    await expect(upload(BEA, "a20.jpg")).rejects.toThrow(/row-level security/);

    expect((await upload(ANA, "first.jpg")).affectedRows).toBe(1);
    const own = await asRole(db, "authenticated", ANA, () => db.query<{ n: number }>(`select public.own_avatar_count() as n`));
    expect(own.rows[0]!.n).toBe(1);

    await asRole(db, "authenticated", BEA, () => db.query(`delete from storage.objects where name = $1`, [`${BEA}/a0.jpg`]));
    expect((await upload(BEA, "again.jpg")).affectedRows).toBe(1);
  });

  it("keeps the counter away from anonymous visitors", async () => {
    await expect(asRole(db, "anon", null, () => db.query(`select public.own_avatar_count()`))).rejects.toThrow(/permission denied/);
  });

  it("still refuses to touch another user's files (update, delete, list, move)", async () => {
    const renamed = await asRole(db, "authenticated", CARLOS, () =>
      db.query(`update storage.objects set name = $1 where name = $2`, [`${CARLOS}/hijack.jpg`, `${ANA}/first.jpg`]),
    );
    expect(renamed.affectedRows).toBe(0);
    const removed = await asRole(db, "authenticated", CARLOS, () =>
      db.query(`delete from storage.objects where name = $1`, [`${ANA}/first.jpg`]),
    );
    expect(removed.affectedRows).toBe(0);
    const listed = await asRole(db, "authenticated", CARLOS, () =>
      db.query(`select name from storage.objects where name like $1`, [`${ANA}/%`]),
    );
    expect(listed.rows).toHaveLength(0);

    await upload(CARLOS, "mine.jpg");
    await expect(
      asRole(db, "authenticated", CARLOS, () =>
        db.query(`update storage.objects set name = $1 where name = $2`, [`${ANA}/moved.jpg`, `${CARLOS}/mine.jpg`]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

// -----------------------------------------------------------------------------
describe("get_public_card", () => {
  it("publishes the meeting rules by allowlist, never the owner's defaults or unknown keys", async () => {
    await db.query(`update public.profiles set meeting_settings = $2::jsonb where id = $1`, [
      ANA,
      JSON.stringify({
        formats: ["video"], weekdays: [1, 2], start: "09:00", end: "14:00", duration: 45, noticeMinutes: 120,
        videoLink: "https://meet.google.com/abc-defg-hij", place: "Mi oficina", secretNote: "private",
      }),
    ]);
    const { rows } = await asRole(db, "anon", null, () =>
      db.query<{ card: { meeting_rules: Record<string, unknown> } }>(`select public.get_public_card('ana') as card`),
    );
    expect(rows[0]!.card.meeting_rules).toEqual({
      formats: ["video"], weekdays: [1, 2], start: "09:00", end: "14:00", duration: 45, noticeMinutes: 120,
    });
    expect(JSON.stringify(rows[0]!.card)).not.toMatch(/meet\.google|Mi oficina|secretNote|private/);
  });

  it("keeps '{}' as an empty object, the hidden links stripped and the grants as before", async () => {
    const { rows } = await asRole(db, "anon", null, () =>
      db.query<{ card: { meeting_rules: unknown } }>(`select public.get_public_card('bea') as card`),
    );
    expect(rows[0]!.card.meeting_rules).toEqual({});
    const ana = await asRole(db, "anon", null, () =>
      db.query<{ card: { links: Array<{ id: string }> } }>(`select public.get_public_card('ana') as card`),
    );
    expect(ana.rows[0]!.card.links.map((l) => l.id)).toEqual(["l-email-1"]);
    const { rows: grants } = await db.query<{ anon: boolean; pub: boolean }>(
      `select has_function_privilege('anon', 'public.get_public_card(text)', 'execute') as anon,
              exists (select 1 from aclexplode((select proacl from pg_proc where oid = 'public.get_public_card(text)'::regprocedure)) a
                      where a.grantee = 0) as pub`,
    );
    expect(grants[0]).toEqual({ anon: true, pub: false });
  });
});

// -----------------------------------------------------------------------------
describe("meeting requests", () => {
  const inDays = (days: number, hour = 10) => {
    const date = new Date(Date.now() + days * 86_400_000);
    date.setUTCHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  const submit = (slug: string, email: string, slots = [inDays(3), inDays(3, 12)]) =>
    asRole(db, "service_role", null, () =>
      db.query<{ result: { id?: string; full?: boolean } | null }>(
        `select public.submit_meeting_request($1, 'Marta Gil', $2, null, '', 'Un café', 'in_person', '', 30, 'Europe/Madrid', $3::timestamptz[], 'qr') as result`,
        [slug, email, slots],
      ),
    );

  it("takes at most 2 live proposals per guest email and card, whatever the case", async () => {
    expect((await submit("ana", "marta@example.com")).rows[0]!.result).toHaveProperty("id");
    expect((await submit("ana", "marta@example.com", [inDays(4)])).rows[0]!.result).toHaveProperty("id");
    expect((await submit("ana", "marta@example.com", [inDays(5)])).rows[0]!.result).toEqual({ full: true, guest: true });
    expect((await submit("ana", "MARTA@Example.com", [inDays(5)])).rows[0]!.result).toEqual({ full: true, guest: true });

    // Another address, and the same address on another card, are not affected.
    expect((await submit("ana", "otra@example.com")).rows[0]!.result).toHaveProperty("id");
    expect((await submit("bea", "marta@example.com")).rows[0]!.result).toHaveProperty("id");

    // Closing one frees a place; times that already passed never counted.
    await db.query(`update public.meeting_requests set status = 'declined' where profile_id = $1 and guest_email = 'marta@example.com'`, [ANA]);
    expect((await submit("ana", "marta@example.com", [inDays(6)])).rows[0]!.result).toHaveProperty("id");
    await db.query(`update public.meeting_requests set slots = array[now() - interval '1 day'] where profile_id = $1 and guest_email = 'marta@example.com' and status = 'pending'`, [ANA]);
    expect((await submit("ana", "marta@example.com", [inDays(7)])).rows[0]!.result).toHaveProperty("id");
  });

  it("never trims a pending or confirmed upcoming meeting when it keeps the latest 500", async () => {
    const owner = BEA;
    await db.query(`delete from public.meeting_requests where profile_id = $1`, [owner]);
    const insert = (name: string, status: string, slot: string, createdDaysAgo: number, confirmed: string | null = null) =>
      db.query(
        `insert into public.meeting_requests (profile_id, guest_name, guest_email, slots, status, confirmed_start, created_at)
         values ($1, $2, $2 || '@example.com', array[$3::timestamptz], $4, $5::timestamptz, now() - make_interval(days => $6))`,
        [owner, name, slot, status, confirmed, createdDaysAgo],
      );
    // Old, but alive: they are beyond the 500 newest, and must survive.
    await insert("oldpending", "pending", inDays(5), 300);
    await insert("oldconfirmed", "confirmed", inDays(4), 299, inDays(4));
    // Old and over: these may go.
    await insert("oldpast", "pending", inDays(-20), 302);
    await insert("oldpastconfirmed", "confirmed", inDays(-10), 301, inDays(-10));
    await insert("olddeclined", "declined", inDays(5), 303);
    // 520 newer closed ones push all of the above beyond the 500 newest.
    await db.query(
      `insert into public.meeting_requests (profile_id, guest_name, guest_email, slots, status, created_at)
       select $1, 'closed' || g, 'closed' || g || '@example.com', array[now() + interval '2 days'], 'cancelled', now() - make_interval(mins => g)
       from generate_series(1, 520) as g`,
      [owner],
    );

    expect((await submit("bea", "nueva@example.com")).rows[0]!.result).toHaveProperty("id");

    const names = (
      await db.query<{ guest_name: string }>(`select guest_name from public.meeting_requests where profile_id = $1 and guest_name not like 'closed%'`, [owner])
    ).rows.map((r) => r.guest_name).sort();
    expect(names).toEqual(["Marta Gil", "oldconfirmed", "oldpending"]);
    const total = await db.query<{ n: number }>(`select count(*)::int as n from public.meeting_requests where profile_id = $1`, [owner]);
    // The 500 newest plus the two live ones that were beyond them.
    expect(total.rows[0]!.n).toBe(502);
  });

  it("refuses control characters in the guest email", async () => {
    await expect(submit("ana", "a\u0001b@example.com")).rejects.toThrow(/meeting_requests_guest_email_no_control/);
    await expect(submit("ana", "a\u007fb@example.com")).rejects.toThrow(/meeting_requests_guest_email_no_control/);
    await expect(submit("ana", "a\u0085b@example.com")).rejects.toThrow(/meeting_requests_guest_email/);
    await expect(submit("ana", "a b@example.com")).rejects.toThrow(/meeting_requests_guest_email/);
    // Letters from any alphabet are fine.
    expect((await submit("ana", "ñandú@example.es", [inDays(9)])).rows[0]!.result).toHaveProperty("id");
  });

  it("applies to new rows only: an old row with a control character survives the migration", async () => {
    const old = await databaseBefore();
    await addUsers(old, ANA);
    await old.query(`insert into public.profiles (id, slug, full_name, is_published, accepts_meeting_requests) values ($1, 'ana', 'Ana', true, true)`, [ANA]);
    await old.query(
      `insert into public.meeting_requests (profile_id, guest_name, guest_email, slots) values ($1, 'Old', $2, array[now() + interval '3 days'])`,
      [ANA, "old\u0001@example.com"],
    );
    await applyThisMigration(old);
    const { rows } = await old.query(`select 1 from public.meeting_requests where guest_name = 'Old'`);
    expect(rows).toHaveLength(1);
    const { rows: c } = await old.query<{ convalidated: boolean }>(
      `select convalidated from pg_constraint where conname = 'meeting_requests_guest_email_no_control'`,
    );
    expect(c[0]!.convalidated).toBe(false);
    await old.close();
  }, 60_000);
});

// -----------------------------------------------------------------------------
describe("retired motifs", () => {
  it("converts them to their successors and stops accepting them", async () => {
    const old = await databaseBefore();
    const patterns = ["orbitas", "relieve", "trama", "rayos", "arco", "cinta"];
    const ids = patterns.map((_, i) => `${String(i + 1).repeat(8)}-0000-4000-8000-000000000000`);
    for (const [i, pattern] of patterns.entries()) {
      await addUsers(old, ids[i]!);
      await old.query(`insert into public.profiles (id, slug, pattern) values ($1, $2, $3)`, [ids[i], `user-${i}`, pattern]);
    }
    await applyThisMigration(old);
    const { rows } = await old.query<{ pattern: string }>(`select pattern from public.profiles order by slug`);
    expect(rows.map((r) => r.pattern)).toEqual(["arco", "corriente", "halo", "persiana", "arco", "cinta"]);

    for (const retired of ["orbitas", "relieve", "trama", "rayos", "sello"]) {
      await expect(old.query(`update public.profiles set pattern = $1 where id = $2`, [retired, ids[0]])).rejects.toThrow(
        /profiles_pattern_kind/,
      );
    }
    for (const current of ["arco", "corriente", "persiana", "pliegue", "halo", "cinta", "monograma", "liso"]) {
      expect((await old.query(`update public.profiles set pattern = $1 where id = $2`, [current, ids[0]])).affectedRows).toBe(1);
    }
    await old.close();
  }, 60_000);
});

// -----------------------------------------------------------------------------
describe("links shape", () => {
  const save = (links: unknown) =>
    asRole(db, "authenticated", ANA, () => db.query(`update public.profiles set links = $1::jsonb where id = $2`, [JSON.stringify(links), ANA]));

  it.each([
    ["an element that is not an object", ["just-a-string"]],
    ["an unknown kind", [{ id: "l-evil-001", kind: "zzz", value: "x", visible: true }]],
    ["a visible flag that is not a boolean", [{ id: "l-evil-001", kind: "website", value: "x", visible: "true" }]],
    ["a short id", [{ id: "x", kind: "website", value: "x", visible: true }]],
    ["a value that is not a string", [{ id: "l-evil-001", kind: "website", value: { a: 1 }, visible: true }]],
    ["a label that is not a string", [{ id: "l-evil-001", kind: "website", value: "x", label: 5, visible: true }]],
    ["a missing visible flag", [{ id: "l-evil-001", kind: "website", value: "x" }]],
    ["a missing id", [{ kind: "website", value: "x", visible: true }]],
    ["a missing kind", [{ id: "l-evil-001", value: "x", visible: true }]],
    ["a missing value", [{ id: "l-evil-001", kind: "website", visible: true }]],
    ["a good link next to a bad one", [{ id: "l-good-001", kind: "email", value: "a@b.co", visible: true }, "oops"]],
  ])("rejects %s", async (_name, links) => {
    await expect(save(links)).rejects.toThrow(/profiles_links_well_formed/);
  });

  it("accepts what the app writes, including the empty list and every kind", async () => {
    const kinds = ["email", "phone", "whatsapp", "linkedin", "website", "instagram", "x", "github", "tiktok", "youtube", "telegram", "booking", "custom"];
    await save(kinds.map((kind, i) => ({ id: `l-kind-${i}0000`, kind, value: "v", visible: i % 2 === 0 })));
    await save(JSON.parse(goodLinks));
    await save([]);
    await db.query(`update public.profiles set links = $1::jsonb where id = $2`, [goodLinks, ANA]);
  });

  it("keeps reporting the older shape and size errors first", async () => {
    await expect(asRole(db, "authenticated", ANA, () => db.query(`update public.profiles set links = '{}'::jsonb where id = $1`, [ANA]))).rejects.toThrow(
      /profiles_links_shape/,
    );
    const huge = [{ id: "l-big-0001", kind: "custom", value: "x".repeat(40_000), visible: true }];
    await expect(save(huge)).rejects.toThrow(/profiles_links_size/);
  });

  it("does not check rows that exist; they are fixed when their links are saved again", async () => {
    const old = await databaseBefore();
    await addUsers(old, ANA);
    await old.query(
      `insert into public.profiles (id, slug, full_name, links) values ($1, 'ana', 'Ana', '[{"id":"x","kind":"old-kind","value":"v","visible":true}]'::jsonb)`,
      [ANA],
    );
    await applyThisMigration(old);

    const found = await old.query(`select id from public.profiles where not public.links_are_well_formed(links)`);
    expect(found.rows).toHaveLength(1);
    // Writing something else to that row fails until its links are rewritten...
    await expect(old.query(`update public.profiles set headline = 'x' where id = $1`, [ANA])).rejects.toThrow(/profiles_links_well_formed/);
    // ...which the editor always does with sanitised links.
    await old.query(`update public.profiles set headline = 'x', links = $2::jsonb where id = $1`, [ANA, goodLinks]);
    await old.query(`alter table public.profiles validate constraint profiles_links_well_formed`);
    await old.close();
  }, 60_000);
});

// -----------------------------------------------------------------------------
describe("privileges and indexes", () => {
  it("closes set_updated_at to PUBLIC without stopping the triggers", async () => {
    const { rows } = await db.query<{ pub: boolean; anon: boolean; auth: boolean }>(
      `select exists (select 1 from aclexplode((select proacl from pg_proc where oid = 'public.set_updated_at()'::regprocedure)) a where a.grantee = 0) as pub,
              has_function_privilege('anon', 'public.set_updated_at()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.set_updated_at()', 'execute') as auth`,
    );
    expect(rows[0]).toEqual({ pub: false, anon: false, auth: false });

    const before = (await db.query<{ updated_at: Date }>(`select updated_at from public.profiles where id = $1`, [CARLOS])).rows[0]!.updated_at;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await asRole(db, "authenticated", CARLOS, () => db.query(`update public.profiles set headline = 'Nuevo' where id = $1`, [CARLOS]));
    const after = (await db.query<{ updated_at: Date }>(`select updated_at from public.profiles where id = $1`, [CARLOS])).rows[0]!.updated_at;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it("does not let users delete their profile row", async () => {
    await expect(asRole(db, "authenticated", CARLOS, () => db.query(`delete from public.profiles where id = $1`, [CARLOS]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("indexes the retention job and the unanswered-proposals cron", async () => {
    const { rows } = await db.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname in ('profile_events_created_idx', 'meeting_requests_unanswered_idx')`,
    );
    const byName = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
    expect(byName.profile_events_created_idx).toMatch(/\(created_at\)/);
    expect(byName.meeting_requests_unanswered_idx).toMatch(/updated_at DESC.*status = 'pending'.*proposed_by = 'guest'/);
  });
});

// -----------------------------------------------------------------------------
describe("no passwords in auth.users", () => {
  const authAdmin = <T>(fn: () => Promise<T>) => asRole(db, "supabase_auth_admin", null, fn);
  const passwordOf = async (id: string) =>
    (await db.query<{ encrypted_password: string | null }>(`select encrypted_password from auth.users where id = $1`, [id])).rows[0]!.encrypted_password;
  const NEW = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;

  it("blanks a password written on insert, whoever writes it", async () => {
    await authAdmin(() => db.query(`insert into auth.users (id, email, encrypted_password) values ($1, 'a@x.com', '$2a$10$abcdefghijklmnopqrstuv')`, [NEW(1)]));
    expect(await passwordOf(NEW(1))).toBe("");
    await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, 'b@x.com', 'plaintext-by-mistake')`, [NEW(2)]);
    expect(await passwordOf(NEW(2))).toBe("");
  });

  it("blanks a password set on an existing user (sign-up over an unconfirmed account, password change)", async () => {
    await authAdmin(() => db.query(`insert into auth.users (id, email, encrypted_password) values ($1, 'c@x.com', '')`, [NEW(3)]));
    await authAdmin(() => db.query(`update auth.users set encrypted_password = '$2a$10$attackerchosenhashvalue' where id = $1`, [NEW(3)]));
    expect(await passwordOf(NEW(3))).toBe("");
  });

  it("leaves passwordless users alone: '' stays '', NULL stays NULL", async () => {
    await authAdmin(() => db.query(`insert into auth.users (id, email, encrypted_password) values ($1, 'd@x.com', ''), ($2, 'e@x.com', null)`, [NEW(4), NEW(5)]));
    expect(await passwordOf(NEW(4))).toBe("");
    expect(await passwordOf(NEW(5))).toBeNull();
    // GoTrue rewrites the whole row on every update, password column included.
    await authAdmin(() => db.query(`update auth.users set email = email || '', encrypted_password = encrypted_password where id in ($1, $2)`, [NEW(4), NEW(5)]));
    expect(await passwordOf(NEW(4))).toBe("");
    expect(await passwordOf(NEW(5))).toBeNull();
    await authAdmin(() => db.query(`update auth.users set encrypted_password = null where id = $1`, [NEW(4)]));
    expect(await passwordOf(NEW(4))).toBeNull();
  });

  it("does not touch other columns, and ignores updates that don't write the password column", async () => {
    await authAdmin(() => db.query(`insert into auth.users (id, email) values ($1, 'f@x.com')`, [NEW(6)]));
    await authAdmin(() => db.query(`update auth.users set email = 'g@x.com' where id = $1`, [NEW(6)]));
    const { rows } = await db.query<{ email: string; encrypted_password: string | null }>(`select email, encrypted_password from auth.users where id = $1`, [NEW(6)]);
    expect(rows[0]).toEqual({ email: "g@x.com", encrypted_password: null });
  });

  it("clears passwords stored before the migration, and leaves passwordless users as they were", async () => {
    const old = await databaseBefore();
    await old.query(
      `insert into auth.users (id, email, encrypted_password) values ($1, 'old@x.com', 'legacy-hash'), ($2, 'otp@x.com', ''), ($3, 'null@x.com', null)`,
      [NEW(7), NEW(8), NEW(9)],
    );
    // The stub has no auth.sessions: the session revocation is skipped, not an error.
    await applyThisMigration(old);
    const read = async (id: string) => (await old.query<{ p: string | null }>(`select encrypted_password as p from auth.users where id = $1`, [id])).rows[0]!.p;
    expect(await read(NEW(7))).toBe("");
    expect(await read(NEW(8))).toBe("");
    expect(await read(NEW(9))).toBeNull();
    await old.close();
  }, 60_000);

  it("revokes sessions that were opened with a password, and only those", async () => {
    const old = await databaseBefore();
    await old.exec(`
      create table auth.sessions (id uuid primary key);
      create table auth.mfa_amr_claims (session_id uuid references auth.sessions (id) on delete cascade, authentication_method text not null);
      insert into auth.sessions (id) values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000a2');
      insert into auth.mfa_amr_claims values ('00000000-0000-4000-8000-0000000000a1', 'password'), ('00000000-0000-4000-8000-0000000000a2', 'otp');
    `);
    await applyThisMigration(old);
    const { rows } = await old.query<{ id: string }>(`select id from auth.sessions order by id`);
    expect(rows.map((r) => r.id)).toEqual(["00000000-0000-4000-8000-0000000000a2"]);
    await old.close();
  }, 60_000);

  it("keeps the function away from the API roles, and can be rolled back with the documented line", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(asRole(db, role, role === "anon" ? null : ANA, () => db.query(`select public.blank_auth_password()`))).rejects.toThrow(
        /permission denied/,
      );
    }
    const rollback = await createTestDatabase();
    await rollback.exec(`drop trigger passme_blank_password on auth.users`);
    await rollback.query(`insert into auth.users (id, email, encrypted_password) values ($1, 'z@x.com', 'kept')`, [NEW(8)]);
    expect((await rollback.query<{ p: string }>(`select encrypted_password as p from auth.users where id = $1`, [NEW(8)])).rows[0]!.p).toBe("kept");
    await rollback.close();
  }, 60_000);
});
