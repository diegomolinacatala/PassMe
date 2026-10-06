import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { fakeSupabase, first } from "./helpers/fake-supabase";
import { decodeAttachment, fakeMeetingsAdmin, MEETING_ID as ID, meetingRow, OWNER_ID as OWNER, type SentEmail } from "./helpers/fake-meetings";

const state: { admin: TypedSupabaseClient | null } = { admin: null };
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => state.admin }));

const data = await import("@/lib/data/meetings");
const service = await import("@/lib/meetings/service");
const { meetingSignature } = await import("@/lib/meetings/links");

const TUE_10 = "2099-10-06T08:00:00.000Z";
const TUE_12 = "2099-10-06T10:00:00.000Z";

function useAdmin(options: Parameters<typeof fakeMeetingsAdmin>[0]) {
  const fake = fakeMeetingsAdmin(options);
  state.admin = fake.client;
  return fake;
}

function mockResend() {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init!.body as string) as SentEmail);
}

async function record() {
  return (await data.getMeetingRecord(ID))!;
}

beforeEach(() => {
  state.admin = null;
  vi.stubEnv("PASSME_SIGNING_SECRET", "s".repeat(40));
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://getpassme.com");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("PASSME_EMAIL_FROM", "PassMe <hola@getpassme.com>");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("meeting data", () => {
  const valid = {
    slots: [TUE_10],
    duration: 30 as const,
    format: "video" as const,
    location: "",
    timeZone: "Europe/Madrid",
    name: "Marta Gil",
    email: "marta@example.com",
    phone: null,
    company: "",
    topic: "",
    consent: true as const,
  };

  it("stores proposals and tells closed and full cards apart", async () => {
    const ok = fakeSupabase(() => ({ data: { id: ID, owner_id: OWNER } }));
    state.admin = ok.client;
    expect(await data.submitMeetingRequest("diego", valid, "qr")).toEqual({ ok: true, id: ID, ownerId: OWNER });
    expect(ok.queries[0]!.calls[0]![1][0]).toMatchObject({ p_slug: "diego", p_slots: [TUE_10], p_format: "video", p_source: "qr" });
    state.admin = fakeSupabase(() => ({ data: { full: true } })).client;
    expect(await data.submitMeetingRequest("diego", valid, "qr")).toEqual({ ok: false, reason: "full" });
    state.admin = fakeSupabase(() => ({ data: null })).client;
    expect(await data.submitMeetingRequest("diego", valid, "qr")).toEqual({ ok: false, reason: "closed" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.admin = fakeSupabase(() => ({ error: { message: "down" } })).client;
    expect(await data.submitMeetingRequest("diego", valid, "qr")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reads rows with canonical timestamps and reports a pending migration", async () => {
    useAdmin({ row: meetingRow() });
    const loaded = await record();
    expect(loaded.meeting.slots).toEqual([TUE_10, TUE_12]);
    expect(loaded.owner).toEqual({ id: OWNER, slug: "diego", name: "Diego Molina", email: null });
    expect(await data.getMeetingRecord("nope")).toBeNull();

    const pending = fakeSupabase(() => ({ error: { message: "relation does not exist", code: "42P01" } }));
    expect(await data.listOwnMeetings(pending.client)).toEqual({ available: false, meetings: [] });
  });

  it("lets the owner clear proposals but not a confirmed meeting still to come", async () => {
    const now = new Date("2099-10-01T00:00:00Z");
    const upcoming = fakeSupabase((q) => (first(q) === "select" ? { data: { status: "confirmed", confirmed_start: TUE_10 } } : {}));
    expect(await data.deleteOwnMeeting(upcoming.client, ID, now)).toEqual({ ok: false, reason: "upcoming" });
    expect(upcoming.queries.some((q) => first(q) === "delete")).toBe(false);

    const pending = fakeSupabase((q) => (first(q) === "select" ? { data: { status: "pending", confirmed_start: null } } : {}));
    expect(await data.deleteOwnMeeting(pending.client, ID, now)).toEqual({ ok: true });
    expect(await data.deleteOwnMeeting(pending.client, "not-a-uuid", now)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("meeting service", () => {
  it("emails the owner each proposed time as a button, replying to the visitor", async () => {
    useAdmin({ row: meetingRow() });
    const sent = mockResend();
    await service.notifyNewProposal(ID);
    const [email] = sent();
    expect(email).toMatchObject({ to: ["diego@example.com"], subject: "Marta Gil te propone una reunión", reply_to: "marta@example.com" });
    const respond = `https://getpassme.com/reunion/${ID}/${meetingSignature(ID, "owner")}`;
    expect(email!.html).toContain(`${respond}?hora=0`);
    expect(email!.html).toContain(`${respond}?hora=1`);
    expect(email!.text).not.toContain("Un café");
    expect(email!.text).not.toContain("Café Central");
  });

  it("confirms once and sends both sides their calendar file", async () => {
    const admin = useAdmin({ row: meetingRow() });
    const sent = mockResend();
    const result = await service.changeMeeting(await record(), "owner", { action: "confirm", slot: TUE_12 }, new Date("2099-10-01T00:00:00Z"));
    if (!result.ok) throw new Error(result.error);
    expect(admin.updates[0]).toMatchObject({ status: "confirmed", confirmed_start: TUE_12, sequence: 1 });
    // Only if nobody changed it meanwhile.
    expect(admin.queries.find((q) => first(q) === "update")!.calls).toContainEqual(["eq", ["sequence", 0]]);

    await result.emails();
    const [toGuest, toOwner] = sent();
    expect(toGuest).toMatchObject({ to: ["marta@example.com"], reply_to: "diego@example.com" });
    expect(toGuest!.subject).toMatch(/^Confirmada: reunión con Diego Molina/);
    expect(toGuest!.attachments![0]).toMatchObject({ filename: "invitacion.ics", content_type: "text/calendar; charset=utf-8; method=PUBLISH" });
    const guestIcs = decodeAttachment(toGuest!);
    expect(guestIcs).toContain('ORGANIZER;CN="Diego Molina":mailto:diego@example.com');
    expect(guestIcs).toContain(`UID:${ID}@getpassme.com`);
    expect(guestIcs).not.toContain("/reunion/");
    expect(toOwner).toMatchObject({ to: ["diego@example.com"], reply_to: "marta@example.com" });
  });

  it("refuses a change that lost the race or isn't allowed", async () => {
    useAdmin({ row: meetingRow(), raced: true });
    const loaded = await record();
    expect(await service.changeMeeting(loaded, "owner", { action: "decline", note: "" })).toEqual({
      ok: false,
      error: "Ha cambiado mientras respondías. Recarga la página para ver cómo está.",
    });
    expect(await service.changeMeeting(loaded, "guest", { action: "confirm", slot: TUE_10 })).toEqual({
      ok: false,
      error: "Esta propuesta ya no admite cambios.",
    });
  });

  it("sends other times to the visitor with no free text and without the owner's address", async () => {
    useAdmin({ row: meetingRow() });
    const sent = mockResend();
    const result = await service.changeMeeting(await record(), "owner", { action: "counter", slots: [TUE_12], note: "Mejor a mediodía" });
    if (!result.ok) throw new Error(result.error);
    await result.emails();
    const [email] = sent();
    expect(email).toMatchObject({ to: ["marta@example.com"], subject: "Diego Molina te propone otra hora" });
    expect(email).not.toHaveProperty("reply_to");
    expect(email!.text).not.toContain("Mejor a mediodía");
    expect(email!.html).toContain(`/reunion/${ID}/${meetingSignature(ID, "guest")}?hora=0`);
    expect(JSON.stringify(email)).not.toContain("diego@example.com");
  });

  it("tells the owner when a visitor withdraws, without the visitor's words", async () => {
    useAdmin({ row: meetingRow() });
    const sent = mockResend();
    const result = await service.changeMeeting(await record(), "guest", { action: "cancel", note: "Compra en spam.example" });
    if (!result.ok) throw new Error(result.error);
    await result.emails();
    const [email] = sent();
    expect(email).toMatchObject({ to: ["diego@example.com"], subject: "Marta Gil ha cancelado su propuesta de reunión" });
    expect(email!.text).not.toContain("spam.example");
  });

  it("cancels a confirmed meeting with a calendar update for the other side", async () => {
    useAdmin({ row: meetingRow({ status: "confirmed", confirmed_start: TUE_10, sequence: 1 }) });
    const sent = mockResend();
    const result = await service.changeMeeting(await record(), "owner", { action: "cancel", note: "Me ha surgido algo" }, new Date("2099-10-01T00:00:00Z"));
    if (!result.ok) throw new Error(result.error);
    await result.emails();
    const [email] = sent();
    expect(email).toMatchObject({ to: ["marta@example.com"], reply_to: "diego@example.com" });
    expect(email!.subject).toMatch(/^Cancelada: reunión con Diego Molina/);
    expect(email!.attachments![0]!.content_type).toContain("method=CANCEL");
    expect(decodeAttachment(email!)).toContain("SEQUENCE:2");
  });
});

describe("email limits", () => {
  it("stops after five emails to the same visitor address in a day", async () => {
    useAdmin({ row: meetingRow(), frozen: true });
    const sent = mockResend();
    for (let i = 0; i < 7; i += 1) {
      const result = await service.changeMeeting(await record(), "owner", { action: "counter", slots: [TUE_12], note: "" });
      if (!result.ok) throw new Error(result.error);
      await result.emails();
    }
    expect(sent().filter((e) => e.to[0] === "marta@example.com")).toHaveLength(5);
  });

  it("keeps meeting emails within a daily budget shared by everyone", async () => {
    vi.stubEnv("MEETING_EMAIL_DAILY_BUDGET", "1");
    useAdmin({ row: meetingRow() });
    const sent = mockResend();
    await service.notifyNewProposal(ID);
    await service.notifyNewProposal(ID);
    expect(sent()).toHaveLength(1);
  });

  it("only offers meetings where both signed links and email work", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    expect(service.meetingsAvailable()).toBe(true);
    vi.stubEnv("RESEND_API_KEY", "");
    expect(service.meetingsAvailable()).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("PASSME_SIGNING_SECRET", "");
    expect(service.meetingsAvailable()).toBe(false);
  });
});
