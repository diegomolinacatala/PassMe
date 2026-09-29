import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asRole, createTestDatabase } from "./supabase-stub";

/**
 * 20260929120000_launch_hardening.sql and 20260929130000_contact_requests.sql
 * run for real (PGlite + Supabase stubs).
 */

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARLOS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const links = JSON.stringify([
  { id: "l-email-1", kind: "email", value: "ana@example.com", visible: true },
  { id: "l-phone-1", kind: "phone", value: "+34 600 000 000", visible: false },
]);

let db: PGlite;

async function slugOf(id: string): Promise<string> {
  const { rows } = await db.query<{ slug: string }>(`select slug from public.profiles where id = $1`, [id]);
  return rows[0]!.slug;
}

async function setSlug(id: string, slug: string) {
  return asRole(db, "authenticated", id, () => db.query(`update public.profiles set slug = $1 where id = $2`, [slug, id]));
}

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query(`insert into auth.users (id) values ($1), ($2), ($3)`, [ANA, BEA, CARLOS]);
  await db.query(
    `insert into public.profiles (id, slug, full_name, links) values
       ($1, 'ana', 'Ana Ruiz', $4::jsonb), ($2, 'bea', 'Bea Gil', '[]'::jsonb), ($3, 'carlos', 'Carlos Paz', '[]'::jsonb)`,
    [ANA, BEA, CARLOS, links],
  );
}, 60_000);

describe("slug history", () => {
  it("keeps a renamed handle reserved for its owner and redirects it", async () => {
    await setSlug(ANA, "ana-ruiz");
    await expect(setSlug(BEA, "ana")).rejects.toThrow(/reserved/);

    const redirect = await asRole(db, "anon", null, () =>
      db.query<{ to: string | null }>(`select public.resolve_slug_redirect('ANA') as to`),
    );
    expect(redirect.rows[0]!.to).toBe("ana-ruiz");

    const available = await asRole(db, "authenticated", BEA, () =>
      db.query<{ ok: boolean }>(`select public.is_slug_available('ana') as ok`),
    );
    expect(available.rows[0]!.ok).toBe(false);
  });

  it("lets the owner go back to an old handle", async () => {
    await setSlug(ANA, "ana");
    expect(await slugOf(ANA)).toBe("ana");
    const { rows } = await db.query<{ slug: string }>(
      `select slug from public.profile_slug_history where profile_id = $1 order by slug`,
      [ANA],
    );
    expect(rows.map((r) => r.slug)).toEqual(["ana-ruiz"]);
  });

  it("stops redirecting when the card is unpublished", async () => {
    await db.query(`update public.profiles set is_published = false where id = $1`, [ANA]);
    const { rows } = await db.query<{ to: string | null }>(`select public.resolve_slug_redirect('ana-ruiz') as to`);
    await db.query(`update public.profiles set is_published = true where id = $1`, [ANA]);
    expect(rows[0]!.to).toBeNull();
  });

  it("caps how many handles one card can hoard", async () => {
    for (let i = 1; i <= 10; i += 1) await setSlug(BEA, `bea-${i}`);
    await expect(setSlug(BEA, "bea-11")).rejects.toThrow(/slug change limit/);
    // Going back to an old handle is always allowed.
    await setSlug(BEA, "bea-3");
    expect(await slugOf(BEA)).toBe("bea-3");
  });

  it("quarantines every handle of a deleted account for 90 days", async () => {
    await setSlug(CARLOS, "carlos-paz");
    await db.query(`delete from auth.users where id = $1`, [CARLOS]);
    const { rows } = await db.query<{ slug: string; profile_id: string | null }>(
      `select slug, profile_id from public.profile_slug_history where slug in ('carlos', 'carlos-paz') order by slug`,
    );
    expect(rows).toEqual([
      { slug: "carlos", profile_id: null },
      { slug: "carlos-paz", profile_id: null },
    ]);
    await expect(setSlug(ANA, "carlos-paz")).rejects.toThrow(/reserved/);

    // After the quarantine the handle is free again, and claiming it clears the history row.
    await db.query(`update public.profile_slug_history set released_at = now() - interval '91 days' where slug = 'carlos-paz'`);
    await setSlug(ANA, "carlos-paz");
    const left = await db.query(`select 1 from public.profile_slug_history where slug = 'carlos-paz'`);
    expect(left.rows).toHaveLength(0);
    await setSlug(ANA, "ana");
  });

  it("validates format and reserved words in is_slug_available", async () => {
    const { rows } = await asRole(db, "authenticated", ANA, () =>
      db.query<Record<string, boolean>>(
        `select public.is_slug_available('dashboard') as reserved, public.is_slug_available('no--pe') as bad,
                public.is_slug_available('ab') as short, public.is_slug_available('fresh-one') as free`,
      ),
    );
    expect(rows[0]).toEqual({ reserved: false, bad: false, short: false, free: true });
  });

  it("keeps the history and its helpers away from the API roles", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        asRole(db, role, role === "anon" ? null : ANA, () => db.query(`select * from public.profile_slug_history`)),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asRole(db, role, role === "anon" ? null : ANA, () => db.query(`select public.slug_reserved_for_other('ana', null)`)),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe("rate_limit_hit", () => {
  it("counts hits in a fixed window and restarts after it", async () => {
    const hit = () =>
      asRole(db, "service_role", null, () =>
        db.query<{ allowed: boolean; retry_after: number }>(`select * from public.rate_limit_hit('k1', 2, 60)`),
      );
    expect((await hit()).rows[0]!.allowed).toBe(true);
    expect((await hit()).rows[0]!.allowed).toBe(true);
    const blocked = (await hit()).rows[0]!;
    expect(blocked.allowed).toBe(false);
    expect(blocked.retry_after).toBeGreaterThan(0);

    await db.query(`update public.rate_limit_buckets set reset_at = now() - interval '1 second' where key = 'k1'`);
    expect((await hit()).rows[0]!.allowed).toBe(true);
  });

  it("is only callable by the server", async () => {
    await expect(asRole(db, "anon", null, () => db.query(`select * from public.rate_limit_hit('x', 1, 1)`))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("record_card_event", () => {
  const record = (slug: string, kind: string, linkId: string | null = null) =>
    asRole(db, "service_role", null, () =>
      db.query<{ ok: boolean }>(`select public.record_card_event($1, $2, 'qr', $3) as ok`, [slug, kind, linkId]),
    );

  it("records views and clicks on visible links only", async () => {
    expect((await record("ANA", "view")).rows[0]!.ok).toBe(true);
    expect((await record("ana", "link_click", "l-email-1")).rows[0]!.ok).toBe(true);
    expect((await record("ana", "link_click", "l-phone-1")).rows[0]!.ok).toBe(false); // hidden
    expect((await record("ana", "link_click", "made-up")).rows[0]!.ok).toBe(false);
    expect((await record("nobody", "view")).rows[0]!.ok).toBe(false);
    const { rows } = await db.query<{ link_id: string | null }>(
      `select link_id from public.profile_events where profile_id = $1 and kind = 'link_click'`,
      [ANA],
    );
    expect(rows.map((r) => r.link_id)).toEqual(["l-email-1"]);
  });

  it("is not callable by visitors", async () => {
    await expect(
      asRole(db, "anon", null, () => db.query(`select public.record_card_event('ana', 'view')`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("apple pass registrations", () => {
  it("keeps only the 10 most recent devices per pass", async () => {
    for (let i = 0; i < 12; i += 1) {
      await db.query(
        `insert into public.apple_pass_registrations (device_library_id, pass_type_id, serial_number, push_token, updated_at)
         values ($1, 'pass.test', $2, 'token', now() + make_interval(secs => $3))`,
        [`device${i}`, ANA, i],
      );
    }
    const { rows } = await db.query<{ device_library_id: string }>(
      `select device_library_id from public.apple_pass_registrations where serial_number = $1 order by updated_at`,
      [ANA],
    );
    expect(rows).toHaveLength(10);
    expect(rows[0]!.device_library_id).toBe("device2");
  });
});

describe("profiles hardening", () => {
  it("rejects oversized links payloads", async () => {
    const huge = JSON.stringify([{ id: "l-big-0001", kind: "custom", value: "x".repeat(40_000), visible: true }]);
    await expect(db.query(`update public.profiles set links = $1::jsonb where id = $2`, [huge, ANA])).rejects.toThrow(
      /profiles_links_size/,
    );
  });

  it("doesn't bump updated_at when nothing changed", async () => {
    const read = async () =>
      (await db.query<{ updated_at: Date }>(`select updated_at from public.profiles where id = $1`, [ANA])).rows[0]!.updated_at.getTime();
    const before = await read();
    await new Promise((r) => setTimeout(r, 5));
    await db.query(`update public.profiles set full_name = full_name where id = $1`, [ANA]);
    expect(await read()).toBe(before);
    await db.query(`update public.profiles set headline = 'Abogada' where id = $1`, [ANA]);
    expect(await read()).toBeGreaterThan(before);
  });

  it("only accepts flat avatar paths in the user's folder", async () => {
    const upload = (name: string) =>
      asRole(db, "authenticated", BEA, () =>
        db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [name]),
      );
    await expect(upload(`${BEA}/nested/avatar.jpg`)).rejects.toThrow(/row-level security/);
    await expect(upload(`${BEA}/avatar.gif`)).rejects.toThrow(/row-level security/);
    expect((await upload(`${BEA}/avatar-1.jpg`)).affectedRows).toBe(1);
  });
});

describe("cleanup_expired_data", () => {
  it("deletes only what is past its retention", async () => {
    await db.query(
      `insert into public.profile_events (profile_id, kind, created_at) values ($1, 'view', now() - interval '401 days'), ($1, 'view', now())`,
      [ANA],
    );
    await db.query(
      `insert into public.auth_otp_attempts (email_hash, created_at) values ($1, now() - interval '2 days'), ($1, now())`,
      ["b".repeat(64)],
    );
    const { rows } = await asRole(db, "service_role", null, () =>
      db.query<{ removed: Record<string, number> }>(`select public.cleanup_expired_data() as removed`),
    );
    expect(rows[0]!.removed).toMatchObject({ events: 1, otp_attempts: 1 });
    await expect(asRole(db, "authenticated", ANA, () => db.query(`select public.cleanup_expired_data()`))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("contact requests", () => {
  const submit = (slug: string, overrides: Record<string, string | null> = {}) => {
    const v = { name: "Lucía", email: "lucia@example.com", phone: null, company: "Mirador", message: "Hola", ...overrides };
    return asRole(db, "service_role", null, () =>
      db.query<{ owner: string | null }>(`select public.submit_contact_request($1, $2, $3, $4, $5, $6, 'qr') as owner`, [
        slug,
        v.name,
        v.email,
        v.phone,
        v.company,
        v.message,
      ]),
    );
  };

  it("only accepts requests for cards that opted in", async () => {
    expect((await submit("ana")).rows[0]!.owner).toBeNull();
    await db.query(`update public.profiles set accepts_contact_requests = true where id = $1`, [ANA]);
    expect((await submit("ana")).rows[0]!.owner).toBe(ANA);

    const card = await asRole(db, "anon", null, () =>
      db.query<{ card: { accepts_contact_requests: boolean } }>(`select public.get_public_card('ana') as card`),
    );
    expect(card.rows[0]!.card.accepts_contact_requests).toBe(true);
  });

  it("validates what visitors send", async () => {
    await expect(submit("ana", { email: null, phone: null })).rejects.toThrow(/contact_requests_reachable/);
    await expect(submit("ana", { email: "not-an-email" })).rejects.toThrow(/contact_requests_email_format/);
    await expect(submit("ana", { name: "" })).rejects.toThrow(/contact_requests_name_length/);
  });

  it("shows requests only to the card owner, who can delete them", async () => {
    const own = await asRole(db, "authenticated", ANA, () => db.query(`select id from public.contact_requests`));
    expect(own.rows).toHaveLength(1);
    const other = await asRole(db, "authenticated", BEA, () => db.query(`select id from public.contact_requests`));
    expect(other.rows).toHaveLength(0);
    await expect(asRole(db, "anon", null, () => db.query(`select id from public.contact_requests`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asRole(db, "authenticated", BEA, () =>
        db.query(`insert into public.contact_requests (profile_id, name, email) values ($1, 'x', 'x@example.com')`, [ANA]),
      ),
    ).rejects.toThrow(/permission denied/);

    const deleted = await asRole(db, "authenticated", ANA, () => db.query(`delete from public.contact_requests`));
    expect(deleted.affectedRows).toBe(1);
  });

  it("keeps at most 1000 requests per card", async () => {
    await db.query(
      `insert into public.contact_requests (profile_id, name, email, created_at)
       select $1, 'n' || g, 'x' || g || '@example.com', now() - make_interval(mins => g) from generate_series(1, 1000) as g`,
      [ANA],
    );
    await submit("ana");
    const { rows } = await db.query<{ n: number; newest: string }>(
      `select count(*)::int as n, (array_agg(name order by created_at desc))[1] as newest from public.contact_requests where profile_id = $1`,
      [ANA],
    );
    expect(rows[0]).toEqual({ n: 1000, newest: "Lucía" });
  });

  it("is only callable by the server", async () => {
    await expect(
      asRole(db, "anon", null, () =>
        db.query(`select public.submit_contact_request('ana', 'x', 'x@example.com', null, '', '', 'qr')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("are deleted by the daily job after 24 months", async () => {
    await db.query(
      `insert into public.contact_requests (profile_id, name, email, created_at) values ($1, 'Old', 'old@example.com', now() - interval '25 months')`,
      [ANA],
    );
    const { rows } = await asRole(db, "service_role", null, () =>
      db.query<{ removed: Record<string, number> }>(`select public.cleanup_expired_data() as removed`),
    );
    expect(rows[0]!.removed.contact_requests).toBe(1);
  });
});
