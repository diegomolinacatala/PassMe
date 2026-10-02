import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asRole, createTestDatabase } from "./supabase-stub";

/** 20261002120000_meeting_requests.sql runs for real (PGlite + Supabase stubs). */

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let db: PGlite;

interface Proposal {
  name: string;
  email: string;
  phone: string | null;
  format: string;
  duration: number;
  slots: string[];
}

const inDays = (days: number, hour = 10) => {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};

function submit(slug: string, overrides: Partial<Proposal> = {}) {
  const v: Proposal = {
    name: "Marta Gil",
    email: "marta@example.com",
    phone: null,
    format: "in_person",
    duration: 30,
    slots: [inDays(3), inDays(3, 12)],
    ...overrides,
  };
  return asRole(db, "service_role", null, () =>
    db.query<{ result: { id?: string; owner_id?: string; full?: boolean } | null }>(
      `select public.submit_meeting_request($1, $2, $3, $4, 'Mirador', 'Un café', $5, 'Café Central', $6, 'Europe/Madrid', $7::timestamptz[], 'qr') as result`,
      [slug, v.name, v.email, v.phone, v.format, v.duration, v.slots],
    ),
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query(`insert into auth.users (id) values ($1), ($2)`, [ANA, BEA]);
  await db.query(
    `insert into public.profiles (id, slug, full_name) values ($1, 'ana', 'Ana Ruiz'), ($2, 'bea', 'Bea Gil')`,
    [ANA, BEA],
  );
}, 60_000);

describe("meeting requests", () => {
  it("only accepts proposals for cards that opted in", async () => {
    expect((await submit("ana")).rows[0]!.result).toBeNull();
    await db.query(`update public.profiles set accepts_meeting_requests = true where id = $1`, [ANA]);
    const { result } = (await submit("ana")).rows[0]!;
    expect(result).toMatchObject({ owner_id: ANA });
    expect(result!.id).toMatch(/^[0-9a-f-]{36}$/);

    const stored = await db.query<{ status: string; proposed_by: string; sequence: number; source: string }>(
      `select status, proposed_by, sequence, source from public.meeting_requests where id = $1`,
      [result!.id],
    );
    expect(stored.rows[0]).toEqual({ status: "pending", proposed_by: "guest", sequence: 0, source: "qr" });

    const card = await asRole(db, "anon", null, () =>
      db.query<{ card: { accepts_meeting_requests: boolean; accepts_contact_requests: boolean } }>(
        `select public.get_public_card('ana') as card`,
      ),
    );
    expect(card.rows[0]!.card).toMatchObject({ accepts_meeting_requests: true, accepts_contact_requests: false });
  });

  it("validates what visitors send", async () => {
    await expect(submit("ana", { slots: [inDays(-1)] })).rejects.toThrow(/must be in the future/);
    await expect(submit("ana", { slots: [] })).rejects.toThrow(/meeting_requests_slots/);
    await expect(submit("ana", { slots: [inDays(1), inDays(2), inDays(3), inDays(4)] })).rejects.toThrow(
      /meeting_requests_slots/,
    );
    await expect(submit("ana", { email: "nope" })).rejects.toThrow(/meeting_requests_guest_email_format/);
    await expect(submit("ana", { email: "x<y@example.com" })).rejects.toThrow(/meeting_requests_guest_email_format/);
    await expect(submit("ana", { email: "x@example.com?bcc=z@example.com" })).rejects.toThrow(
      /meeting_requests_guest_email_format/,
    );
    await expect(submit("ana", { name: "" })).rejects.toThrow(/meeting_requests_guest_name_length/);
    await expect(submit("ana", { phone: "call me" })).rejects.toThrow(/meeting_requests_guest_phone_format/);
    await expect(submit("ana", { format: "dinner" })).rejects.toThrow(/meeting_requests_format/);
    await expect(submit("ana", { duration: 90 })).rejects.toThrow(/meeting_requests_duration/);
    await expect(
      db.query(`update public.meeting_requests set status = 'confirmed', confirmed_start = null`),
    ).rejects.toThrow(/meeting_requests_confirmed/);
  });

  it("stops taking proposals while 30 live ones are waiting for an answer", async () => {
    // Unanswered proposals whose times have passed don't count (nor can they lock a card).
    await db.query(
      `insert into public.meeting_requests (profile_id, guest_name, guest_email, slots)
       select $1, 'old' || g, 'old' || g || '@example.com', array[now() - interval '1 day'] from generate_series(1, 40) as g`,
      [ANA],
    );
    expect((await submit("ana")).rows[0]!.result).toHaveProperty("id");
    await db.query(
      `insert into public.meeting_requests (profile_id, guest_name, guest_email, slots)
       select $1, 'n' || g, 'x' || g || '@example.com', array[now() + interval '2 days'] from generate_series(1, 28) as g`,
      [ANA],
    );
    expect((await submit("ana")).rows[0]!.result).toEqual({ full: true });
    await db.query(`update public.meeting_requests set status = 'declined' where guest_name like 'n%'`);
    expect((await submit("ana")).rows[0]!.result).toHaveProperty("id");
  });

  it("shows proposals only to the card owner, who can delete them but not edit them", async () => {
    const own = await asRole(db, "authenticated", ANA, () => db.query(`select id from public.meeting_requests`));
    expect(own.rows.length).toBeGreaterThan(0);
    const other = await asRole(db, "authenticated", BEA, () => db.query(`select id from public.meeting_requests`));
    expect(other.rows).toHaveLength(0);
    await expect(asRole(db, "anon", null, () => db.query(`select id from public.meeting_requests`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asRole(db, "authenticated", ANA, () => db.query(`update public.meeting_requests set status = 'confirmed'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(db, "authenticated", BEA, () =>
        db.query(
          `insert into public.meeting_requests (profile_id, guest_name, guest_email, slots) values ($1, 'x', 'x@example.com', array[now()])`,
          [ANA],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    const deleted = await asRole(db, "authenticated", ANA, () =>
      db.query(`delete from public.meeting_requests where guest_name = 'n1'`),
    );
    expect(deleted.affectedRows).toBe(1);
  });

  it("is only callable by the server", async () => {
    await expect(
      asRole(db, "anon", null, () =>
        db.query(
          `select public.submit_meeting_request('ana', 'x', 'x@example.com', null, '', '', 'video', '', 30, 'Europe/Madrid', array[now() + interval '1 day'])`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("are deleted by the daily job 90 days after their last proposed time", async () => {
    await db.query(
      `insert into public.meeting_requests (profile_id, guest_name, guest_email, slots, created_at) values
         ($1, 'Old', 'old@example.com', array[now() - interval '91 days'], now() - interval '100 days'),
         ($1, 'Recent', 'recent@example.com', array[now() - interval '10 days'], now() - interval '20 days')`,
      [ANA],
    );
    const { rows } = await asRole(db, "service_role", null, () =>
      db.query<{ removed: Record<string, number> }>(`select public.cleanup_expired_data() as removed`),
    );
    expect(rows[0]!.removed.meeting_requests).toBe(1);
    const left = await db.query(`select 1 from public.meeting_requests where guest_name = 'Recent'`);
    expect(left.rows).toHaveLength(1);
  });

  it("go away with the owner's account", async () => {
    await db.query(`delete from auth.users where id = $1`, [ANA]);
    const { rows } = await db.query(`select 1 from public.meeting_requests where profile_id = $1`, [ANA]);
    expect(rows).toHaveLength(0);
  });
});
