import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * How much a public form can cost: per visitor and card (2 an hour for the same details),
 * notification emails per owner (10 a day) and for the whole service (20 a day by default).
 */

const state = vi.hoisted(() => ({
  ip: "203.0.113.1",
  after: [] as Array<() => unknown>,
  sendEmail: vi.fn<(mail: { to: string; subject: string; text: string }) => Promise<boolean>>(async () => true),
  submitted: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": state.ip }) }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (task: () => unknown) => state.after.push(task),
}));
vi.mock("@/lib/data/cards", () => ({
  lookupPublicCard: async (slug: string) => ({ status: "found", card: { slug, fullName: "Alguien", acceptsContactRequests: true } }),
}));
vi.mock("@/lib/data/contact-requests", () => ({
  submitContactRequest: async (slug: string) => {
    state.submitted.push(slug);
    return { ok: true, ownerId: `owner-of-${slug}` };
  },
  getOwnerEmail: async (ownerId: string) => `${ownerId}@example.com`,
}));
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => true, sendEmail: state.sendEmail }));

let contactDelivery: typeof import("@/lib/contact-delivery");
let publicActions: typeof import("@/app/u/[slug]/actions");

const VALID = { name: "Lucía", email: "lucia@example.com", phone: null, company: "", message: "", consent: true as const };

function form(email = "lucia@example.com"): FormData {
  const data = new FormData();
  data.set("name", "Lucía Ferrer");
  data.set("email", email);
  data.set("consent", "on");
  return data;
}

async function runAfterTasks() {
  const tasks = state.after.splice(0);
  for (const task of tasks) await task();
}

beforeEach(async () => {
  // Fresh limiters (they live in module memory in tests) for every test.
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  state.ip = "203.0.113.1";
  state.after = [];
  state.submitted = [];
  state.sendEmail.mockClear();
  contactDelivery = await import("@/lib/contact-delivery");
  publicActions = await import("@/app/u/[slug]/actions");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("notification emails to the owner", () => {
  it("are capped at 10 a day per owner, though every contact is still stored", async () => {
    for (let i = 0; i < 13; i += 1) {
      expect(await contactDelivery.deliverContactRequest("busy-card", VALID, "qr")).toEqual({ ok: true });
      await runAfterTasks();
    }
    expect(state.submitted).toHaveLength(13);
    expect(state.sendEmail).toHaveBeenCalledTimes(10);
  });

  it("share a daily budget of 20 across the whole service", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < 40; i += 1) {
      await contactDelivery.deliverContactRequest(`card-${i}`, VALID, "share");
      await runAfterTasks();
    }
    expect(state.submitted).toHaveLength(40);
    expect(state.sendEmail).toHaveBeenCalledTimes(20);
    // The ones that didn't get an email leave a trace for us.
    expect(warn.mock.calls.some(([line]) => String(line).includes("daily budget spent"))).toBe(true);
  });

  it("an owner already over their own limit does not eat the shared budget", async () => {
    for (let i = 0; i < 20; i += 1) {
      await contactDelivery.deliverContactRequest("chatty-card", VALID, "qr");
      await runAfterTasks();
    }
    expect(state.sendEmail).toHaveBeenCalledTimes(10);
    // 10 of the 20 are left for everybody else.
    for (let i = 0; i < 30; i += 1) {
      await contactDelivery.deliverContactRequest(`other-${i}`, VALID, "qr");
      await runAfterTasks();
    }
    expect(state.sendEmail).toHaveBeenCalledTimes(20);
  });

  it("the shared budget follows CONTACT_EMAIL_DAILY_BUDGET", async () => {
    vi.stubEnv("CONTACT_EMAIL_DAILY_BUDGET", "3");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < 6; i += 1) {
      await contactDelivery.deliverContactRequest(`small-${i}`, VALID, "qr");
      await runAfterTasks();
    }
    expect(state.sendEmail).toHaveBeenCalledTimes(3);
  });

  it("never carry what the visitor wrote", async () => {
    await contactDelivery.deliverContactRequest("quiet-card", { ...VALID, message: "Mira https://evil.example", name: "Eve" }, "qr");
    await runAfterTasks();
    const mail = state.sendEmail.mock.calls[0]![0];
    expect(mail.text).not.toContain("evil.example");
    expect(mail.text).not.toContain("Eve");
  });
});

describe("the public contact form", () => {
  const send = (slug: string) => publicActions.submitContactAction(slug, "qr", { status: "idle" }, form());

  it("takes the same details twice an hour on one card, then asks to wait", async () => {
    expect(await send("alex")).toMatchObject({ status: "sent" });
    expect(await send("alex")).toMatchObject({ status: "sent" });
    const third = await send("alex");
    expect(third).toMatchObject({ status: "error", message: "Ya le has dejado tu contacto a esta persona. Prueba dentro de un rato." });
    // The form is refilled for them, and nothing was stored.
    expect(third.status === "error" && third.values?.name).toBe("Lucía Ferrer");
    expect(state.submitted).toEqual(["alex", "alex"]);
  });

  it("lets different people on the same connection leave their contact on the same card (an event's Wi-Fi)", async () => {
    for (let i = 0; i < 4; i += 1) {
      expect(await publicActions.submitContactAction("speaker", "qr", { status: "idle" }, form(`guest${i}@example.com`))).toMatchObject({ status: "sent" });
    }
  });

  it("counts per card and per visitor, not across them", async () => {
    await send("alex");
    await send("alex");
    expect(await send("marta")).toMatchObject({ status: "sent" });
    state.ip = "198.51.100.44";
    expect(await send("alex")).toMatchObject({ status: "sent" });
  });

  it("treats the same card typed in another case as the same card", async () => {
    await send("alex");
    await send("ALEX");
    expect(await send("Alex")).toMatchObject({ status: "error" });
  });

  it("does not spend the budget on invalid forms", async () => {
    const bad = new FormData();
    bad.set("name", "Sin consentimiento");
    for (let i = 0; i < 5; i += 1) {
      expect(await publicActions.submitContactAction("alex", "qr", { status: "idle" }, bad)).toMatchObject({ status: "error" });
    }
    expect(await send("alex")).toMatchObject({ status: "sent" });
    expect(await send("alex")).toMatchObject({ status: "sent" });
  });
});
