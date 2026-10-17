import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicCard } from "@/lib/card/types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { fakeMeetingsAdmin, MEETING_ID as ID, meetingRow, OWNER_ID } from "./helpers/fake-meetings";
import { fakeSupabase } from "./helpers/fake-supabase";

/**
 * The server actions and the .ics route, outside demo mode: the signed page's calendar file
 * agrees with the emailed one (F1), a failing database is a retry and not «ya no está»
 * (M1, L1), and a saved answer says when its emails couldn't go (F3).
 */

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
vi.mock("@/lib/data/cards", () => ({ getPublicCard: async () => state.card, lookupPublicCard: async () => (state.card ? { status: "found", card: state.card } : { status: "missing" }) }));

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

function inDays(days: number, hour: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

const proposal = {
  slot: [inDays(3, 8), inDays(3, 10)],
  duration: "30",
  format: "in_person",
  location: "Café Central",
  timeZone: "Europe/Madrid",
  name: "Marta Gil",
  email: "marta@example.com",
  consent: "on",
};

const guestSig = () => meetingSignature(ID, "guest")!;
const ownerSig = () => meetingSignature(ID, "owner")!;

let ipCounter = 100;
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
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the signed page's calendar file (F1)", () => {
  async function download(sig: string) {
    const response = await icsRoute(new Request("https://getpassme.com/x"), { params: Promise.resolve({ id: ID, sig }) });
    return { response, ics: (await response.text()).replace(/\r\n /g, "") };
  }

  it("names the card's email to the guest, never the login one, like the emailed copy", async () => {
    // The card shows a work address; the account (login) address is diego@example.com.
    state.card = { fullName: "Diego Molina", acceptsMeetingRequests: true, links: [{ kind: "email", value: "hola@estudio.example", label: "" }] };
    useAdmin({ row: meetingRow({ status: "confirmed", confirmed_start: TUE_10, sequence: 1, format: "video", location: "" }) });
    const { ics } = await download(guestSig());
    expect(ics).toContain('ORGANIZER;CN="Diego Molina":mailto:hola@estudio.example');
    expect(ics).toContain("Email: hola@estudio.example");
    expect(ics).not.toContain("diego@example.com");

    // The owner's own copy is theirs: their login address.
    expect((await download(ownerSig())).ics).toContain("mailto:diego@example.com");
  });

  it("falls back to the login address only when the card shows none", async () => {
    useAdmin({ row: meetingRow({ status: "confirmed", confirmed_start: TUE_10, sequence: 1 }) });
    expect((await download(guestSig())).ics).toContain("mailto:diego@example.com");
  });

  it("keeps a link-like card name out of the guest's file (F6)", async () => {
    const lure = "Gana 500 EUR en secure-login.com/premio";
    const row = meetingRow({ status: "confirmed", confirmed_start: TUE_10, sequence: 1 });
    const fake = fakeSupabase((q) => (q.table === "profiles" ? { data: { id: OWNER_ID, slug: "diego", full_name: lure } } : { data: row }));
    state.admin = {
      ...(fake.client as unknown as Record<string, unknown>),
      auth: { admin: { getUserById: async () => ({ data: { user: { email: "diego@example.com" } }, error: null }) } },
    };
    const { ics } = await download(guestSig());
    expect(ics).not.toContain("secure-login");
    expect(ics).toContain("SUMMARY:Reunión con Tu contacto de PassMe");
  });

  it("answers 503 with a retry hint when the database fails, and 404 for a meeting that isn't there", async () => {
    state.admin = fakeSupabase(() => ({ error: { message: "down", code: "XX000" } })).client;
    const failed = await download(guestSig());
    expect(failed.response.status).toBe(503);
    expect(failed.response.headers.get("retry-after")).toBe("5");
    expect(failed.response.headers.get("cache-control")).toBe("private, no-store");

    state.admin = fakeSupabase(() => ({ data: null })).client;
    expect((await download(guestSig())).response.status).toBe(404);
  });
});

describe("when the database fails (M1, L1)", () => {
  const answer = () => respondMeetingAction(ID, ownerSig(), { status: "idle" }, form({ intent: "decline" }));

  it("offers a retry instead of saying the meeting is gone", async () => {
    state.admin = fakeSupabase(() => ({ error: { message: "down", code: "XX000" } })).client;
    expect(await answer()).toEqual({ status: "error", message: "No hemos podido cargarla. Inténtalo de nuevo en un momento." });
    state.admin = fakeSupabase(() => ({ data: null })).client;
    expect(await answer()).toEqual({ status: "error", message: "No encontramos esta reunión. Puede que ya se haya borrado." });
  });

  it("tells a failed save from a change made meanwhile", async () => {
    const row = meetingRow();
    state.admin = fakeSupabase((q) => {
      if (q.table === "profiles") return { data: { id: OWNER_ID, slug: "diego", full_name: "Diego Molina" } };
      if (q.table === "rpc:rate_limit_hit") return { data: [{ allowed: true, retry_after: 0 }] };
      if (q.calls[0]?.[0] === "update") return { error: { message: "down" } };
      return { data: row };
    }).client;
    expect(await answer()).toEqual({ status: "error", message: "No hemos podido guardar el cambio. Inténtalo de nuevo." });

    useAdmin({ row, raced: true });
    expect(await answer()).toMatchObject({ status: "error", message: expect.stringMatching(/Ha cambiado mientras respondías/) });
  });

  it("renders a retry page for a database error, and «ya no está» only for a meeting that is gone", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: MeetingPage } = await import("@/app/reunion/[id]/[sig]/page");
    const page = async (query: Record<string, string> = {}) =>
      renderToStaticMarkup(await MeetingPage({ params: Promise.resolve({ id: ID, sig: ownerSig() }), searchParams: Promise.resolve(query) } as never));

    state.admin = fakeSupabase(() => ({ error: { message: "down", code: "XX000" } })).client;
    const failed = await page({ hora: "1" });
    expect(failed).toContain("No hemos podido cargarla");
    expect(failed).toContain("Intentarlo de nuevo");
    // The retry button brings back the time the email's button had chosen.
    expect(failed).toContain(`href="/reunion/${ID}/${ownerSig()}?hora=1"`);
    expect(failed).not.toContain("ya no está");

    state.admin = fakeSupabase(() => ({ data: null })).client;
    const gone = await page();
    expect(gone).toContain("Esta reunión ya no está");
    expect(gone).not.toContain("Intentarlo de nuevo");
  });
});

describe("saying so when an email can't go (F3)", () => {
  it("flags a saved answer whose invitation emails were held back, and only then", async () => {
    useAdmin({ row: meetingRow() });
    const ok = await respondMeetingAction(ID, ownerSig(), { status: "idle" }, form({ intent: "confirm", slot: TUE_12 }));
    expect(ok).toMatchObject({ status: "done", action: "confirm" });
    expect(ok).not.toHaveProperty("emailsSkipped");

    vi.stubEnv("RESEND_API_KEY", "");
    useAdmin({ row: meetingRow() });
    const held = await respondMeetingAction(ID, ownerSig(), { status: "idle" }, form({ intent: "confirm", slot: TUE_12 }));
    expect(held).toMatchObject({ status: "done", action: "confirm", emailsSkipped: true });
  });

  it("still keeps the owner's address from a visitor whose proposal nobody has answered", async () => {
    // The emails were prepared with the owner's addresses; the page the visitor gets must not carry them.
    state.card = { fullName: "Diego Molina", acceptsMeetingRequests: true, links: [{ kind: "email", value: "hola@estudio.example", label: "" }] };
    useAdmin({ row: meetingRow() });
    const withdrawn = await respondMeetingAction(ID, guestSig(), { status: "idle" }, form({ intent: "cancel" }));
    expect(withdrawn).toMatchObject({ status: "done", action: "cancel", view: { party: "guest", owner: { email: null } } });
    expect(JSON.stringify(withdrawn)).not.toContain("diego@example.com");
    expect(JSON.stringify(withdrawn)).not.toContain("hola@estudio.example");
  });

  it("flags a proposal that was saved but whose owner email won't be sent", async () => {
    vi.stubEnv("MEETING_EMAIL_DAILY_BUDGET", "1");
    useAdmin({ row: meetingRow(), submit: { id: ID, owner_id: OWNER_ID } });
    const first = await submitMeetingAction("diego", "qr", { status: "idle" }, form(proposal));
    expect(first).toMatchObject({ status: "sent" });
    expect(first).not.toHaveProperty("emailSkipped");

    state.ip = "198.51.100.250";
    const second = await submitMeetingAction("diego", "qr", { status: "idle" }, form(proposal));
    expect(second).toMatchObject({ status: "sent", emailSkipped: true });
    // Both proposals are saved; only the first one will email the owner.
    expect(state.after).toHaveLength(1);
    await state.after[0]!();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
