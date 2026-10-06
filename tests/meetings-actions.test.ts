import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicCard } from "@/lib/card/types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { fakeMeetingsAdmin, MEETING_ID as ID, meetingRow, OWNER_ID } from "./helpers/fake-meetings";

/** The server actions and the .ics route, outside demo mode (Supabase, signing secret and email configured). */

const state = vi.hoisted(() => ({
  admin: null as unknown,
  ip: "203.0.113.1",
  card: null as unknown,
  after: [] as Array<() => unknown>,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => state.admin }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": state.ip }) }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (task: () => unknown) => state.after.push(task),
}));
vi.mock("@/lib/data/cards", () => ({ getPublicCard: async () => state.card }));

const { submitMeetingAction } = await import("@/app/u/[slug]/meeting-actions");
const { respondMeetingAction } = await import("@/app/reunion/actions");
const { GET: icsRoute } = await import("@/app/reunion/[id]/[sig]/invitacion.ics/route");
const { meetingSignature } = await import("@/lib/meetings/links");

const TUE_10 = "2099-10-06T08:00:00.000Z";
const TUE_12 = "2099-10-06T10:00:00.000Z";

function useAdmin(options: Parameters<typeof fakeMeetingsAdmin>[0]) {
  const fake = fakeMeetingsAdmin(options);
  state.admin = fake.client as TypedSupabaseClient;
  return fake;
}

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}

/** A time within the 60-day horizon, on the hour. */
function inDays(days: number, hour: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}
const SOON = [inDays(3, 8), inDays(3, 10)];

const proposal = {
  slot: SOON,
  duration: "30",
  format: "in_person",
  location: "Café Central",
  timeZone: "Europe/Madrid",
  name: "Marta Gil",
  email: "marta@example.com",
  consent: "on",
};

let ipCounter = 0;
beforeEach(() => {
  ipCounter += 1;
  state.ip = `198.51.100.${ipCounter}`;
  state.after = [];
  state.card = { fullName: "Diego Molina", acceptsMeetingRequests: true, links: [] } as Partial<PublicCard>;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
  vi.stubEnv("PASSME_SIGNING_SECRET", "s".repeat(40));
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://getpassme.com");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("PASSME_EMAIL_FROM", "PassMe <hola@getpassme.com>");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("proposing a meeting", () => {
  it("stores a valid proposal and emails the owner after responding", async () => {
    const admin = useAdmin({ row: meetingRow(), submit: { id: ID, owner_id: OWNER_ID } });
    const result = await submitMeetingAction("diego", "qr", { status: "idle" }, form(proposal));
    expect(result).toMatchObject({ status: "sent", email: "marta@example.com", details: { name: "Marta Gil" } });
    const submit = admin.queries.find((q) => q.table === "rpc:submit_meeting_request")!;
    expect(submit.calls[0]![1][0]).toMatchObject({ p_slug: "diego", p_slots: SOON, p_source: "qr", p_location: "Café Central" });
    expect(state.after).toHaveLength(1);
    await state.after[0]!();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("ignores bots and reports invalid input without touching the database", async () => {
    const admin = useAdmin({ row: meetingRow() });
    expect(await submitMeetingAction("diego", "qr", { status: "idle" }, form({ ...proposal, website: "x" }))).toEqual({ status: "idle" });
    const invalid = await submitMeetingAction("diego", "qr", { status: "idle" }, form({ ...proposal, email: "" }));
    expect(invalid).toMatchObject({ status: "error", errors: { email: expect.any(String) } });
    expect(admin.queries.filter((q) => q.table === "rpc:submit_meeting_request")).toHaveLength(0);
  });

  it("refuses cards that don't take proposals, full cards and setups without email", async () => {
    useAdmin({ row: meetingRow(), submit: { full: true } });
    state.card = { fullName: "Diego Molina", acceptsMeetingRequests: false, links: [] };
    expect(await submitMeetingAction("diego", "qr", { status: "idle" }, form(proposal))).toMatchObject({
      message: "Esta tarjeta ya no acepta propuestas de reunión.",
    });
    state.card = { fullName: "Diego Molina", acceptsMeetingRequests: true, links: [] };
    expect(await submitMeetingAction("diego", "qr", { status: "idle" }, form(proposal))).toMatchObject({
      message: expect.stringMatching(/muchas propuestas pendientes/),
    });
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await submitMeetingAction("diego", "qr", { status: "idle" }, form(proposal))).toMatchObject({ status: "error" });
  });
});

describe("answering a meeting", () => {
  const ownerSig = () => meetingSignature(ID, "owner")!;
  const guestSig = () => meetingSignature(ID, "guest")!;

  it("refuses a forged link before reading anything", async () => {
    const admin = useAdmin({ row: meetingRow() });
    const result = await respondMeetingAction(ID, "A".repeat(32), { status: "idle" }, form({ intent: "decline" }));
    expect(result).toEqual({ status: "error", message: "Este enlace no es válido. Ábrelo de nuevo desde el último email." });
    expect(admin.queries).toHaveLength(0);
  });

  it("confirms from the owner's link, whatever the case of the id", async () => {
    const admin = useAdmin({ row: meetingRow() });
    const result = await respondMeetingAction(
      ID.toUpperCase(),
      ownerSig(),
      { status: "idle" },
      form({ intent: "confirm", slot: TUE_12, location: "Café Central" }),
    );
    expect(result).toMatchObject({ status: "done", action: "confirm", view: { stage: "confirmed", confirmedStart: TUE_12, party: "owner" } });
    expect(admin.updates[0]).toMatchObject({ status: "confirmed", location: "Café Central" });
    expect(state.after).toHaveLength(1);
  });

  it("shows the card's visible email (read through the public card) as the one the guest gets", async () => {
    useAdmin({ row: meetingRow() });
    state.card = { fullName: "Diego Molina", acceptsMeetingRequests: true, links: [{ kind: "email", value: "hola@estudio.example", label: "" }] };
    const result = await respondMeetingAction(ID, ownerSig(), { status: "idle" }, form({ intent: "confirm", slot: TUE_12 }));
    expect(result).toMatchObject({ status: "done", view: { owner: { email: "hola@estudio.example" } } });
  });

  it("keeps each side to its own moves and validates what it sends", async () => {
    useAdmin({ row: meetingRow() });
    expect(await respondMeetingAction(ID, guestSig(), { status: "idle" }, form({ intent: "confirm", slot: TUE_10 }))).toEqual({
      status: "error",
      message: "Esta propuesta ya no admite cambios.",
    });
    const linked = await respondMeetingAction(ID, ownerSig(), { status: "idle" }, form({ intent: "decline", note: "Mira www.evil.example" }));
    expect(linked).toMatchObject({ status: "error", errors: { note: expect.any(String) } });
    const unknown = await respondMeetingAction(ID, ownerSig(), { status: "idle" }, form({ intent: "delete" }));
    expect(unknown).toMatchObject({ status: "error", message: "Acción no válida." });
  });

  it("serves the calendar file only for a confirmed meeting and a valid link", async () => {
    useAdmin({ row: meetingRow({ status: "confirmed", confirmed_start: TUE_10, sequence: 1 }) });
    const ok = await icsRoute(new Request("https://getpassme.com/x"), { params: Promise.resolve({ id: ID, sig: guestSig() }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/calendar");
    expect(await ok.text()).toContain(`UID:${ID}@getpassme.com`);

    const forged = await icsRoute(new Request("https://getpassme.com/x"), { params: Promise.resolve({ id: ID, sig: "A".repeat(32) }) });
    expect(forged.status).toBe(404);
    useAdmin({ row: meetingRow() });
    const pending = await icsRoute(new Request("https://getpassme.com/x"), { params: Promise.resolve({ id: ID, sig: guestSig() }) });
    expect(pending.status).toBe(404);
  });
});
