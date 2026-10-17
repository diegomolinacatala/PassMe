import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { fakeSupabase, first, type RecordedQuery } from "./helpers/fake-supabase";
import { decodeAttachment, fakeMeetingsAdmin, MEETING_ID as ID, meetingRow, OWNER_ID as OWNER, type SentEmail } from "./helpers/fake-meetings";

/**
 * Hardening of «Agendar reunión» (audit 2026-10-17): one cap key per mailbox, a slice of the
 * email budget for mail nobody asked for, List-Unsubscribe, calendar copies that don't carry a
 * link-like card name, nothing silent when an email is held back or fails, and a cron that
 * cleans first and sends the expiry notices within bounds.
 */

const state: { admin: TypedSupabaseClient | null } = { admin: null };
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => state.admin }));
vi.mock("@/lib/data/cards", () => ({ getPublicCard: async () => null, lookupPublicCard: async () => ({ status: "missing" }) }));

const data = await import("@/lib/data/meetings");
const service = await import("@/lib/meetings/service");
const { mailboxKey } = await import("@/lib/meetings/mailbox");
const { sanitizeHeaders, sendEmailDetailed } = await import("@/lib/email");
const { buildIcs, googleCalendarUrl } = await import("@/lib/meetings/calendar");
const { meetingEvent, FALLBACK_OWNER_NAME } = await import("@/lib/meetings/model");
const { viewGoogleCalendarUrl, toMeetingView } = await import("@/lib/meetings/view");
const { GET: cronRoute } = await import("@/app/api/cron/cleanup/route");

const TUE_10 = "2099-10-06T08:00:00.000Z";
const TUE_12 = "2099-10-06T10:00:00.000Z";

function useAdmin(options: Parameters<typeof fakeMeetingsAdmin>[0]) {
  const fake = fakeMeetingsAdmin(options);
  state.admin = fake.client;
  return fake;
}

function mockResend(respond: (index: number) => Response | Promise<Response> = () => new Response("{}", { status: 200 })) {
  let index = 0;
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => respond(index++));
  vi.stubGlobal("fetch", fetchMock);
  return () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init!.body as string) as SentEmail);
}

async function record() {
  return (await data.getMeetingRecord(ID))!;
}

/** What the logger wrote to a console method, parsed. */
function logged(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return spy.mock.calls.map(([line]) => JSON.parse(String(line).replace(/^\[passme\] /, "")) as Record<string, unknown>);
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.admin = null;
  vi.stubEnv("PASSME_SIGNING_SECRET", "s".repeat(40));
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://getpassme.com");
  vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "contacto+passme@example.com");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("PASSME_EMAIL_FROM", "PassMe <hola@getpassme.com>");
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  error = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("one cap key per mailbox (F2)", () => {
  it("folds case, +tags, Gmail dots and lookalike letters into the same inbox", () => {
    const gmail = mailboxKey("marta.gil@gmail.com");
    expect(gmail).toBe("martagil@gmail.com");
    for (const variant of ["Marta.Gil@Gmail.com", "martagil+news@gmail.com", "m.a.r.t.a.g.i.l+x.y@googlemail.com", "ｍａｒｔａｇｉｌ@gmail.com"]) {
      expect(mailboxKey(variant)).toBe(gmail);
    }
    expect(mailboxKey("Ana+uno@example.com")).toBe(mailboxKey("ana+dos@EXAMPLE.com"));
    expect(mailboxKey("ana@example。com")).toBe("ana@example.com");
    expect(mailboxKey("ana@exämple.com")).toBe("ana@xn--exmple-cua.com");
  });

  it("keeps apart what really is another inbox", () => {
    // Only Gmail ignores dots; elsewhere they make a different address.
    expect(mailboxKey("a.b@example.com")).not.toBe(mailboxKey("ab@example.com"));
    expect(mailboxKey("ana@example.com")).not.toBe(mailboxKey("ana@example.org"));
    // A leading + has no name before the tag: it isn't folded into other tags.
    expect(mailboxKey("+x@example.com")).not.toBe(mailboxKey("+y@example.com"));
    expect(mailboxKey("no-at-sign")).toBe("no-at-sign");
  });

  it("stops at five emails to one inbox however it is written", async () => {
    const row = meetingRow();
    useAdmin({ row, frozen: true });
    const sent = mockResend();
    const spellings = ["marta@gmail.com", "Marta+1@gmail.com", "mar.ta@googlemail.com", "m.a.r.t.a+x@gmail.com", "MARTA@gmail.com", "marta+z@gmail.com", "ma.rta@gmail.com", "marta+9@GMAIL.com"];
    for (const guest_email of spellings) {
      row.guest_email = guest_email;
      const result = await service.changeMeeting(await record(), "owner", { action: "counter", slots: [TUE_12], note: "" });
      if (!result.ok) throw new Error(result.error);
      await result.emails();
    }
    expect(sent()).toHaveLength(5);
    expect(logged(warn).filter((entry) => entry.reason === "address_cap")).toHaveLength(3);
  });
});

describe("List-Unsubscribe and the email headers (F2)", () => {
  it("sanitizes extra headers: valid names only, nothing the message decides, no line breaks", () => {
    expect(
      sanitizeHeaders({
        "List-Unsubscribe": "<mailto:a@example.com>\r\nBcc: x@example.com",
        "Bcc": "x@example.com",
        "Reply-To": "x@example.com",
        "X Bad Name": "1",
        "X-Empty": "  ",
      }),
    ).toEqual({ "List-Unsubscribe": "<mailto:a@example.com> Bcc: x@example.com" });
  });

  it("sends them to Resend, and says why an email didn't go", async () => {
    const sent = mockResend();
    expect(await sendEmailDetailed({ to: "a@example.com", subject: "Hola", text: "x", headers: { "List-Unsubscribe": "<https://getpassme.com/privacidad>" } })).toEqual({ ok: true });
    expect(sent()[0]!.headers).toEqual({ "List-Unsubscribe": "<https://getpassme.com/privacidad>" });
    expect(sent()[0]).not.toHaveProperty("reply_to");

    mockResend(() => new Response("{}", { status: 422 }));
    expect(await sendEmailDetailed({ to: "a@example.com", subject: "Hola", text: "x" })).toEqual({ ok: false, reason: "rejected", status: 422 });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await sendEmailDetailed({ to: "a@example.com", subject: "Hola", text: "x" })).toMatchObject({ ok: false, reason: "network" });
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendEmailDetailed({ to: "a@example.com", subject: "Hola", text: "x" })).toEqual({ ok: false, reason: "not_configured" });
  });

  it("goes on every email to the visitor's unverified address, never to the owner", async () => {
    useAdmin({ row: meetingRow() });
    const sent = mockResend();
    const result = await service.changeMeeting(await record(), "owner", { action: "decline", note: "" });
    if (!result.ok) throw new Error(result.error);
    await result.emails();
    const [email] = sent();
    expect(email!.to).toEqual(["marta@example.com"]);
    expect(email!.headers!["List-Unsubscribe"]).toBe(
      "<mailto:contacto+passme@example.com?subject=Baja%20de%20avisos%20de%20reuniones>, <https://getpassme.com/privacidad#reuniones>",
    );
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "");
    expect(service.unsubscribeHeaders()["List-Unsubscribe"]).toBe("<https://getpassme.com/privacidad#reuniones>");
  });
});

describe("a card name that looks like a link stays out of the visitor's calendar (F6)", () => {
  const LURE = "Gana 500 EUR en secure-login.com/premio";
  async function confirmedMeeting() {
    state.admin = fakeMeetingsAdmin({ row: meetingRow({ status: "confirmed", confirmed_start: TUE_10, sequence: 1, format: "video", location: "" }) }).client;
    return (await record()).meeting;
  }

  it("uses a neutral name in the guest's .ics (summary, organizer, description) and Google link", async () => {
    const confirmed = await confirmedMeeting();
    const event = meetingEvent(confirmed, { name: LURE, email: "hola@estudio.example" }, "guest", { uidDomain: "getpassme.com" });
    const ics = buildIcs(event, "PUBLISH", new Date("2099-01-01T00:00:00Z"));
    expect(ics).not.toContain("secure-login");
    expect(ics).toContain(`SUMMARY:Reunión con ${FALLBACK_OWNER_NAME}`);
    expect(ics).toContain(`ORGANIZER;CN="${FALLBACK_OWNER_NAME}":mailto:hola@estudio.example`);
    expect(ics).toContain(`Con: ${FALLBACK_OWNER_NAME}`);
    expect(decodeURIComponent(googleCalendarUrl(event).replace(/\+/g, " "))).not.toContain("secure-login");
  });

  it("keeps real names, and the owner's own copy keeps the owner's name", async () => {
    const confirmed = await confirmedMeeting();
    const real = meetingEvent(confirmed, { name: "Diego Molina", email: "hola@estudio.example" }, "guest", { uidDomain: "getpassme.com" });
    expect(real.summary).toBe("Reunión con Diego Molina");
    const own = meetingEvent(confirmed, { name: LURE, email: "diego@example.com" }, "owner", { uidDomain: "getpassme.com" });
    expect(own.organizer.name).toBe(LURE);
    expect(own.summary).toBe("Reunión con Marta Gil");
  });

  it("applies to the emailed .ics and Google button the service builds", async () => {
    useAdmin({ row: meetingRow() });
    const sent = mockResend();
    const loaded = await record();
    const result = await service.changeMeeting({ ...loaded, owner: { ...loaded.owner, name: LURE } }, "owner", { action: "confirm", slot: TUE_12 });
    if (!result.ok) throw new Error(result.error);
    await result.emails();
    const toGuest = sent().find((email) => email.to[0] === "marta@example.com")!;
    expect(decodeAttachment(toGuest)).not.toContain("secure-login");
    expect(toGuest.text).not.toContain("secure-login");
    expect(toGuest.html).not.toContain("secure-login");
    expect(toGuest.subject).toContain(FALLBACK_OWNER_NAME);
  });

  it("applies to the Google link on the guest's signed page", async () => {
    const confirmed = await confirmedMeeting();
    const owner = { id: OWNER, name: LURE, slug: "diego", email: null, contactEmail: "hola@estudio.example" };
    const guestView = toMeetingView(confirmed, owner, "guest", new Date("2099-10-01T00:00:00Z"));
    expect(decodeURIComponent(viewGoogleCalendarUrl(guestView)!.replace(/\+/g, " "))).not.toContain("secure-login");
    const ownerView = toMeetingView(confirmed, owner, "owner", new Date("2099-10-01T00:00:00Z"));
    expect(decodeURIComponent(viewGoogleCalendarUrl(ownerView)!.replace(/\+/g, " "))).toContain("Marta Gil");
  });
});

describe("no Reply-To before the owner confirms (F10)", () => {
  it("leaves it out of everything a visitor sends the owner until the meeting is confirmed", async () => {
    // The owner has proposed other times, so the visitor may counter or decline; a first proposal they may withdraw.
    useAdmin({ row: meetingRow({ proposed_by: "owner", sequence: 1 }), frozen: true });
    const sent = mockResend();
    for (const change of [
      { action: "counter", slots: [TUE_12], note: "" },
      { action: "decline", note: "" },
    ] as const) {
      const result = await service.changeMeeting(await record(), "guest", change);
      if (!result.ok) throw new Error(result.error);
      await result.emails();
    }
    useAdmin({ row: meetingRow() });
    const withdrawn = await service.changeMeeting(await record(), "guest", { action: "cancel", note: "" });
    if (!withdrawn.ok) throw new Error(withdrawn.error);
    await withdrawn.emails();
    const emails = sent();
    expect(emails).toHaveLength(3);
    for (const email of emails) {
      expect(email.to).toEqual(["diego@example.com"]);
      expect(email).not.toHaveProperty("reply_to");
      expect(email).not.toHaveProperty("headers");
      expect(email.text).toContain("tu dirección no se comparte");
    }
  });

  it("keeps it once the meeting is confirmed: then the two may write to each other", async () => {
    useAdmin({ row: meetingRow({ status: "confirmed", confirmed_start: TUE_10, sequence: 1 }) });
    const sent = mockResend();
    const result = await service.changeMeeting(await record(), "guest", { action: "cancel", note: "" }, new Date("2099-10-01T00:00:00Z"));
    if (!result.ok) throw new Error(result.error);
    await result.emails();
    expect(sent()[0]).toMatchObject({ to: ["diego@example.com"], reply_to: "marta@example.com" });
  });
});

describe("a slice of the daily budget for mail nobody asked for (F3)", () => {
  it("lets answers through after unknown visitors used up their slice", async () => {
    vi.stubEnv("MEETING_EMAIL_DAILY_BUDGET", "10");
    useAdmin({ row: meetingRow() });
    const sent = mockResend();
    // Proposals from unknown visitors: 4 of the 10 emails a day (40%).
    const reports = [];
    for (let i = 0; i < 6; i += 1) reports.push(await service.notifyNewProposal(ID));
    expect(sent()).toHaveLength(4);
    expect(reports.map((report) => report.sent)).toEqual([1, 1, 1, 1, 0, 0]);
    expect(logged(warn).filter((entry) => entry.reason === "anonymous_budget")).toHaveLength(2);

    // The owner's tap still sends both invitations: the rest of the budget was kept for it.
    const result = await service.changeMeeting(await record(), "owner", { action: "confirm", slot: TUE_12 });
    if (!result.ok) throw new Error(result.error);
    expect(result.emailsSkipped).toBe(false);
    await result.emails();
    expect(sent()).toHaveLength(6);
  });

  it("tells the visitor before answering when the owner's email can't go", async () => {
    vi.stubEnv("MEETING_EMAIL_DAILY_BUDGET", "1000");
    useAdmin({ row: meetingRow() });
    mockResend();
    const outcomes = [];
    // 30 first emails per owner and day; a 31st is held back and the visitor can be told.
    for (let i = 0; i < 31; i += 1) outcomes.push(await service.admitNewProposal(ID, OWNER));
    expect(outcomes.filter(Boolean)).toHaveLength(30);
    expect(outcomes[30]).toBe(false);
    expect(logged(warn).at(-1)).toMatchObject({ message: "meeting email skipped", kind: "proposal", meetingId: ID, party: "owner", reason: "owner_cap" });
  });

  it("counts a visitor's withdrawal of an unanswered proposal against the same first-contact allowance", async () => {
    vi.stubEnv("MEETING_EMAIL_DAILY_BUDGET", "1000");
    useAdmin({ row: meetingRow(), frozen: true });
    mockResend();
    let skippedAt = -1;
    for (let i = 0; i < 31; i += 1) {
      const result = await service.changeMeeting(await record(), "guest", { action: "cancel", note: "" });
      if (!result.ok) throw new Error(result.error);
      if (result.emailsSkipped && skippedAt < 0) skippedAt = i;
    }
    expect(skippedAt).toBe(30);
  });

  it("gives a visitor's answers to what the owner started their own allowance, not the first-contact one", async () => {
    vi.stubEnv("MEETING_EMAIL_DAILY_BUDGET", "1000");
    useAdmin({ row: meetingRow({ proposed_by: "owner", sequence: 1 }), frozen: true });
    mockResend();
    let skippedAt = -1;
    for (let i = 0; i < 31; i += 1) {
      const result = await service.changeMeeting(await record(), "guest", { action: "counter", slots: [TUE_12], note: "" });
      if (!result.ok) throw new Error(result.error);
      if (result.emailsSkipped && skippedAt < 0) skippedAt = i;
    }
    expect(skippedAt).toBe(30);
    // The first-contact allowance is untouched by all that.
    expect(await service.admitNewProposal(ID, OWNER)).toBe(true);
  });

  it("reports that emails were held back, and why it matters: nothing is promised that isn't coming", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    useAdmin({ row: meetingRow() });
    const result = await service.changeMeeting(await record(), "owner", { action: "confirm", slot: TUE_12 });
    if (!result.ok) throw new Error(result.error);
    expect(result.emailsSkipped).toBe(true);
    expect(logged(error).some((entry) => entry.reason === "email_not_configured")).toBe(true);
  });
});

describe("nothing fails silently, and one email never holds back the other (M5)", () => {
  it("sends the owner's invitation even when the visitor's fails, and logs the failure with its context", async () => {
    useAdmin({ row: meetingRow() });
    // The visitor's email is built first; the provider drops it, the owner's goes.
    const sent = mockResend((index) => (index === 0 ? new Response("{}", { status: 500 }) : new Response("{}", { status: 200 })));
    const result = await service.changeMeeting(await record(), "owner", { action: "confirm", slot: TUE_12 });
    if (!result.ok) throw new Error(result.error);
    const report = await result.emails();
    expect(sent()).toHaveLength(2);
    expect(report).toEqual({ sent: 1, skipped: 0, failed: 1 });
    expect(logged(error)).toContainEqual(
      expect.objectContaining({ message: "meeting email failed", kind: "confirmed", meetingId: ID, party: "guest", reason: "rejected", status: 500 }),
    );
  });

  it("logs a network failure as an error too, and the rest still goes", async () => {
    useAdmin({ row: meetingRow() });
    const sent = mockResend((index) => (index === 0 ? Promise.reject(new Error("offline")) : new Response("{}", { status: 200 })));
    const result = await service.changeMeeting(await record(), "owner", { action: "confirm", slot: TUE_12 });
    if (!result.ok) throw new Error(result.error);
    expect(await result.emails()).toEqual({ sent: 1, skipped: 0, failed: 1 });
    expect(sent()).toHaveLength(2);
    expect(logged(error)).toContainEqual(expect.objectContaining({ message: "meeting email failed", party: "guest", reason: "network" }));
  });

  it("logs a missing address instead of dropping the email without a trace", async () => {
    useAdmin({ row: meetingRow() });
    const sent = mockResend();
    // The owner's login email can't be found (the lookup failed).
    (state.admin as unknown as { auth: { admin: { getUserById: () => Promise<unknown> } } }).auth.admin.getUserById = async () => ({ data: { user: null }, error: null });
    const result = await service.changeMeeting(await record(), "owner", { action: "confirm", slot: TUE_12 });
    if (!result.ok) throw new Error(result.error);
    expect(result.emailsSkipped).toBe(true);
    await result.emails();
    expect(sent().map((email) => email.to[0])).toEqual(["marta@example.com"]);
    expect(logged(error)).toContainEqual(expect.objectContaining({ message: "meeting email skipped", kind: "confirmed", party: "owner", reason: "no_recipient" }));
  });
});

describe("«missing» is not «error» is not «conflict» (M1, L1)", () => {
  function admin(handler: (q: RecordedQuery) => { data?: unknown; error?: { message: string; code?: string } | null }) {
    state.admin = fakeSupabase(handler).client;
  }

  it("tells a meeting that isn't there from a database that failed", async () => {
    admin(() => ({ data: null }));
    expect(await data.findMeetingRecord(ID)).toEqual({ status: "missing" });
    admin(() => ({ error: { message: "relation does not exist", code: "42P01" } }));
    expect(await data.findMeetingRecord(ID)).toEqual({ status: "missing" });
    expect(await data.findMeetingRecord("not-a-uuid")).toEqual({ status: "missing" });

    admin(() => ({ error: { message: "connection reset", code: "08006" } }));
    expect(await data.findMeetingRecord(ID)).toEqual({ status: "error" });
    expect(await data.getMeetingRecord(ID)).toBeNull();
    expect(logged(error)).toContainEqual(expect.objectContaining({ message: "meeting lookup failed", id: ID }));

    // The meeting reads fine but its owner doesn't.
    admin((q) => (q.table === "meeting_requests" ? { data: meetingRow() } : { error: { message: "timeout", code: "57014" } }));
    expect(await data.findMeetingRecord(ID)).toEqual({ status: "error" });
    state.admin = null;
    expect(await data.findMeetingRecord(ID)).toEqual({ status: "error" });
  });

  it("tells a lost race from a failed write", async () => {
    const patch = { status: "cancelled" as const, response_note: "", sequence: 1 };
    admin(() => ({ data: null }));
    expect(await data.updateMeeting(ID, 0, patch)).toEqual({ status: "conflict" });
    expect(await data.updateMeeting("nope", 0, patch)).toEqual({ status: "conflict" });
    admin(() => ({ error: { message: "down" } }));
    expect(await data.updateMeeting(ID, 0, patch)).toEqual({ status: "error" });
    admin(() => ({ data: meetingRow({ status: "cancelled", sequence: 1 }) }));
    expect(await data.updateMeeting(ID, 0, patch)).toMatchObject({ status: "updated", meeting: { status: "cancelled", sequence: 1 } });
  });

  it("changeMeeting says which: not allowed, changed meanwhile, or try again", async () => {
    const row = meetingRow();
    const flaky = fakeSupabase((q) => {
      if (q.table === "profiles") return { data: { id: OWNER, slug: "diego", full_name: "Diego Molina" } };
      if (first(q) === "update") return { error: { message: "down" } };
      return { data: row };
    });
    state.admin = flaky.client;
    expect(await service.changeMeeting(await record(), "owner", { action: "decline", note: "" })).toEqual({
      ok: false,
      error: "No hemos podido guardar el cambio. Inténtalo de nuevo.",
      reason: "unavailable",
    });
  });

  it("lists: an unreadable list isn't an empty one", async () => {
    const down = fakeSupabase(() => ({ error: { message: "down", code: "XX000" } }));
    expect(await data.listOwnMeetings(down.client)).toEqual({ available: true, meetings: [], failed: true });
    const pending = fakeSupabase(() => ({ error: { message: "relation does not exist", code: "42P01" } }));
    expect(await data.listOwnMeetings(pending.client)).toEqual({ available: false, meetings: [] });
    state.admin = down.client;
    expect(await data.listUnansweredGuestProposals(new Date(), 62)).toBeNull();
    expect(await data.lookupOwnMeeting(down.client, ID)).toBe("error");
    const none = fakeSupabase(() => ({ data: null }));
    expect(await data.lookupOwnMeeting(none.client, ID)).toBe("none");
    expect(await data.ownsMeeting(down.client, ID)).toBe(false);
  });
});

describe("the daily cron (F9, L7)", () => {
  const NOW = Date.now();
  const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
  const SECRET = "c".repeat(24);
  const AA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const BB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const CC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  function cronAdmin(options: { cleanupError?: boolean; listError?: boolean } = {}) {
    const hits = new Map<string, number>();
    const rows = [
      meetingRow({ id: AA, slots: [hoursAgo(30), hoursAgo(3)], guest_email: "ana@example.com" }),
      meetingRow({ id: BB, slots: [hoursAgo(2)], guest_email: "bea@example.com" }),
      meetingRow({ id: CC, slots: [hoursAgo(1)], guest_email: "cris@example.com" }),
    ];
    const fake = fakeSupabase((q) => {
      if (q.table === "rpc:rate_limit_hit") {
        const { p_key, p_limit } = q.calls[0]![1][0] as { p_key: string; p_limit: number };
        const count = (hits.get(p_key) ?? 0) + 1;
        hits.set(p_key, count);
        return { data: [{ allowed: count <= p_limit, retry_after: 0 }] };
      }
      if (q.table === "rpc:cleanup_expired_data") {
        return options.cleanupError ? { error: { message: "cleanup down" } } : { data: { events: 3, meeting_requests: 1 } };
      }
      if (q.table === "meeting_requests") return options.listError ? { error: { message: "down", code: "XX000" } } : { data: rows };
      if (q.table === "profiles") return { data: [{ id: OWNER, slug: "diego", full_name: "Diego Molina", is_published: true, accepts_meeting_requests: true }] };
      return {};
    });
    state.admin = fake.client;
    return fake;
  }

  const request = (secret = SECRET) => new NextRequest("https://getpassme.com/api/cron/cleanup", { headers: { authorization: `Bearer ${secret}` } });
  const order = (fake: { queries: RecordedQuery[] }) =>
    fake.queries.map((q) => q.table).filter((table) => table === "rpc:cleanup_expired_data" || table === "meeting_requests");

  it("stays closed without CRON_SECRET, and says so in the logs in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const response = await cronRoute(request());
    expect(response.status).toBe(404);
    await cronRoute(request());
    const closed = logged(error).filter((entry) => String(entry.message).includes("CRON_SECRET"));
    // Once per instance, not once per probe.
    expect(closed).toHaveLength(1);
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await cronRoute(request("wrong".padEnd(24, "x")))).status).toBe(401);
  });

  it("cleans first, then sends the expiry notices, and reports sent against qualified", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const fake = cronAdmin();
    const sent = mockResend();
    const response = await cronRoute(request());
    expect(response.status).toBe(200);
    // The retention job runs before anything that could be slow.
    expect(order(fake)).toEqual(["rpc:cleanup_expired_data", "meeting_requests"]);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      removed: { events: 3 },
      expiredProposals: 3,
      expiryNotices: { qualified: 3, attempted: 3, sent: 3, failed: 0, skipped: 0, alreadyNotified: 0, truncated: false },
    });
    expect(sent().map((email) => email.to[0]).sort()).toEqual(["ana@example.com", "bea@example.com", "cris@example.com"]);
    expect(sent()[0]!.headers!["List-Unsubscribe"]).toContain("mailto:contacto+passme@example.com");
  });

  it("a failed cleanup is a failed run, but the notices still go out", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    cronAdmin({ cleanupError: true });
    const sent = mockResend();
    const response = await cronRoute(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, removed: null, expiryNotices: { sent: 3 } });
    expect(sent()).toHaveLength(3);
    expect(logged(error)).toContainEqual(expect.objectContaining({ message: "cleanup_expired_data failed" }));
  });

  it("logs when the proposals can't be listed instead of reporting a quiet zero", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    cronAdmin({ listError: true });
    mockResend();
    const response = await cronRoute(request());
    expect(await response.json()).toMatchObject({ ok: true, expiryNotices: { qualified: 0, problem: "lookup_failed" } });
    expect(logged(error)).toContainEqual(expect.objectContaining({ message: "expired proposal emails not tried", problem: "lookup_failed" }));
  });

  it("stops at its count and time limits and leaves the rest for the next run", async () => {
    cronAdmin();
    const sent = mockResend();
    const run = await service.notifyExpiredProposals(new Date(NOW), { maxNotices: 2 });
    expect(run).toMatchObject({ qualified: 3, sent: 2, truncated: true });
    // Oldest first: the one closest to leaving the look-back window.
    expect(sent()[0]!.to[0]).toBe("ana@example.com");
    // The next run picks up the third and doesn't repeat the two told already.
    const next = await service.notifyExpiredProposals(new Date(NOW), { maxNotices: 2 });
    expect(next).toMatchObject({ qualified: 3, sent: 1, alreadyNotified: 2, truncated: false });
    expect(sent().map((email) => email.to[0])).toHaveLength(3);

    cronAdmin();
    let tick = 0;
    const timed = await service.notifyExpiredProposals(new Date(NOW), { timeBudgetMs: 40_000, clock: () => (tick += 30_000) });
    expect(timed.truncated).toBe(true);
    expect(timed.sent).toBeLessThan(3);
  });

  it("spends a meeting's single notice only after the email went", async () => {
    cronAdmin();
    let outage = true;
    const sent = mockResend(() => (outage ? new Response("{}", { status: 503 }) : new Response("{}", { status: 200 })));
    const down = await service.notifyExpiredProposals(new Date(NOW));
    expect(down).toMatchObject({ qualified: 3, attempted: 3, sent: 0, failed: 3 });
    expect(logged(error).filter((entry) => entry.message === "meeting email failed" && entry.kind === "expired")).toHaveLength(3);

    // The provider is back: nobody lost their notice to the outage...
    outage = false;
    const retry = await service.notifyExpiredProposals(new Date(NOW));
    expect(retry).toMatchObject({ sent: 3, failed: 0, alreadyNotified: 0 });
    // ...and once told, never twice (the look-back windows of two runs overlap).
    const again = await service.notifyExpiredProposals(new Date(NOW));
    expect(again).toMatchObject({ sent: 0, attempted: 0, alreadyNotified: 3 });
    expect(sent()).toHaveLength(6);
  });

  it("keeps the notice of a visitor whose email was held back by an allowance", async () => {
    vi.stubEnv("MEETING_EMAIL_DAILY_BUDGET", "1");
    cronAdmin();
    const sent = mockResend();
    const firstRun = await service.notifyExpiredProposals(new Date(NOW));
    expect(firstRun).toMatchObject({ qualified: 3, sent: 1, skipped: 2 });
    expect(logged(warn).filter((entry) => entry.reason === "anonymous_budget")).toHaveLength(2);
    // Next day the allowance is back (the fake counts on: a bigger budget stands for it): the two held back are told, the first isn't again.
    vi.stubEnv("MEETING_EMAIL_DAILY_BUDGET", "100");
    const next = await service.notifyExpiredProposals(new Date(NOW));
    expect(next).toMatchObject({ sent: 2, alreadyNotified: 1 });
    expect(new Set(sent().map((email) => email.to[0])).size).toBe(3);
  });

  it("does nothing without email set up, and says so", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    cronAdmin();
    expect(await service.notifyExpiredProposals(new Date(NOW))).toMatchObject({ qualified: 0, problem: "email_not_configured" });
  });
});
