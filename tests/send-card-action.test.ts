import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerCard, PublicCard } from "@/lib/card/types";
import { DEMO_CARD } from "@/lib/card/demo";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { fakeSupabase, type RecordedQuery } from "./helpers/fake-supabase";

/**
 * "Mandarle mi tarjeta a Alex" (welcome after creating a card): only the
 * target and the visit source come from the browser; everything sent is read
 * from the sender's saved card, through the same delivery as the public form.
 */

const state = vi.hoisted(() => ({
  ip: "203.0.113.1",
  supabase: null as unknown,
  user: null as { id: string; email: string | null } | null,
  ownCard: null as unknown,
  target: null as unknown,
  admin: null as unknown,
  submitResult: "owner-id" as unknown,
  after: [] as Array<() => unknown>,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": state.ip }) }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (task: () => unknown) => state.after.push(task),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => state.supabase,
  getSessionUser: async () => state.user,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => state.admin }));
vi.mock("@/lib/data/cards", () => ({
  findOwnerCard: async () => state.ownCard,
  getPublicCard: async () => state.target,
}));

const { sendMyCardAction } = await import("@/app/dashboard/actions");

let queries: RecordedQuery[] = [];
let ipCounter = 0;

const SENDER: OwnerCard = {
  ...DEMO_CARD,
  id: "22222222-2222-4222-8222-222222222222",
  slug: "lucia-ferrer",
  fullName: "Lucía Ferrer",
  company: "Mirador",
  links: [
    { id: "l-email-1", kind: "email", value: "lucia@mirador.es", visible: true },
    { id: "l-phone-1", kind: "phone", value: "+34 611 22 33 44", visible: false },
  ],
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://getpassme.com");
  ipCounter += 1;
  state.ip = `198.51.100.${ipCounter}`;
  state.supabase = { auth: {} };
  state.user = { id: `user-${ipCounter}`, email: "login@example.com" };
  state.ownCard = SENDER;
  state.target = { slug: "alex", fullName: "Alex Rivera", acceptsContactRequests: true } as Partial<PublicCard>;
  state.submitResult = "owner-id";
  state.after = [];
  const hits = new Map<string, number>();
  const fake = fakeSupabase((q) => {
    if (q.table === "rpc:rate_limit_hit") {
      const { p_key, p_limit } = q.calls[0]![1][0] as { p_key: string; p_limit: number };
      const count = (hits.get(p_key) ?? 0) + 1;
      hits.set(p_key, count);
      return { data: [{ allowed: count <= p_limit, retry_after: count <= p_limit ? 0 : 60 }] };
    }
    if (q.table === "rpc:submit_contact_request") return { data: state.submitResult };
    return {};
  });
  queries = fake.queries;
  state.admin = fake.client as TypedSupabaseClient;
});

afterEach(() => vi.unstubAllEnvs());

const submitted = () => queries.filter((q) => q.table === "rpc:submit_contact_request").map((q) => q.calls[0]![1][0] as Record<string, unknown>);

describe("sendMyCardAction", () => {
  it("leaves the sender's own card details on the target card", async () => {
    await expect(sendMyCardAction("Alex", "share")).resolves.toEqual({ ok: true });
    expect(submitted()).toEqual([
      {
        p_slug: "alex",
        p_name: "Lucía Ferrer",
        p_email: "lucia@mirador.es",
        // The phone is hidden on the card: it stays out.
        p_phone: null,
        p_company: "Mirador",
        p_message: "Ha creado su tarjeta de PassMe desde la tuya.\nEsta es: https://getpassme.com/u/lucia-ferrer",
        p_source: "share",
      },
    ]);
    // The owner is told by email after the response (fixed text, no sender data).
    expect(state.after).toHaveLength(1);
  });

  it("only accepts known visit sources", async () => {
    await sendMyCardAction("alex", "crear");
    expect(submitted()[0]?.p_source).toBe("direct");
  });

  it("simulates it in demo mode and for the sample card", async () => {
    state.supabase = null;
    await expect(sendMyCardAction("alex", "share")).resolves.toEqual({ ok: true, demo: true });
    state.supabase = { auth: {} };
    await expect(sendMyCardAction("demo", "share")).resolves.toEqual({ ok: true, demo: true });
    expect(submitted()).toEqual([]);
  });

  it("rejects malformed targets, missing sessions and the sender's own card", async () => {
    await expect(sendMyCardAction("../admin", "share")).resolves.toMatchObject({ ok: false });
    state.user = null;
    await expect(sendMyCardAction("alex", "share")).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/sesión/) });
    state.user = { id: "u-self", email: null };
    await expect(sendMyCardAction("lucia-ferrer", "share")).resolves.toMatchObject({ ok: false });
    expect(submitted()).toEqual([]);
  });

  it("offers sharing instead when the card no longer takes contacts", async () => {
    state.target = { slug: "alex", acceptsContactRequests: false } as Partial<PublicCard>;
    await expect(sendMyCardAction("alex", "share")).resolves.toMatchObject({ ok: false, shareInstead: true });
    expect(submitted()).toEqual([]);
  });

  it("offers sharing instead when the card shows neither an email nor a phone", async () => {
    state.ownCard = { ...SENDER, links: [{ id: "l-email-1", kind: "email", value: "x@y.es", visible: false }] };
    await expect(sendMyCardAction("alex", "share")).resolves.toMatchObject({ ok: false, shareInstead: true });
    expect(submitted()).toEqual([]);
  });

  it("stops after a few sends per account", async () => {
    state.user = { id: "busy-user", email: null };
    const results = [];
    for (let i = 0; i < 6; i += 1) {
      state.ip = `192.0.2.${i}`;
      results.push(await sendMyCardAction("alex", "share"));
    }
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toMatchObject({ ok: false });
  });
});
