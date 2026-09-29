import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { fakeSupabase, first, type Handler } from "./helpers/fake-supabase";

const state: { admin: TypedSupabaseClient | null } = { admin: null };
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => state.admin }));

const otp = await import("@/lib/data/otp-attempts");
const { createSharedRateLimiter } = await import("@/lib/data/rate-limits");
const contacts = await import("@/lib/data/contact-requests");
const { sendEmail } = await import("@/lib/email");
const { verifyCaptcha } = await import("@/lib/captcha");
const { syncGoogleObject } = await import("@/lib/pass/google");
const { DEMO_CARD } = await import("@/lib/card/demo");
const { toPublicCard } = await import("@/lib/data/cards");

function useAdmin(handler: Handler) {
  const fake = fakeSupabase(handler);
  state.admin = fake.client;
  return fake;
}

beforeEach(() => {
  state.admin = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OTP lockout backed by Supabase", () => {
  const countIs = (count: number): Handler => (q) => (first(q) === "select" ? { count } : {});

  it("records the attempt before counting, and locks past the limit", async () => {
    const fake = useAdmin(countIs(otp.OTP_MAX_ATTEMPTS));
    expect(await otp.registerOtpAttempt("shared@example.com", "203.0.113.1")).toBe(true);
    expect(fake.queries.map(first).slice(0, 3)).toEqual(["insert", "select", "select"]);

    useAdmin(countIs(otp.OTP_MAX_ATTEMPTS + 1));
    expect(await otp.registerOtpAttempt("shared2@example.com", "203.0.113.1")).toBe(false);
  });

  it("also locks an email tried from too many places at once", async () => {
    const email = "spread@example.com";
    const global = otp.hashEmail(email);
    // This client has barely tried, but the email as a whole is past its ceiling.
    useAdmin((q) => {
      if (first(q) !== "select") return {};
      const isGlobal = q.calls.some(([method, args]) => method === "eq" && args[1] === global);
      return { count: isGlobal ? otp.OTP_MAX_ATTEMPTS_PER_EMAIL + 1 : 1 };
    });
    expect(await otp.registerOtpAttempt(email, "198.51.100.7")).toBe(false);
  });

  it("fails closed if the attempt cannot be stored or counted", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useAdmin((q) => (first(q) === "insert" ? { error: { message: "db down" } } : { count: 0 }));
    expect(await otp.registerOtpAttempt("anyone@example.com", "203.0.113.2")).toBe(false);
    useAdmin((q) => (first(q) === "select" ? { error: { message: "db down" } } : {}));
    expect(await otp.registerOtpAttempt("anyone2@example.com", "203.0.113.2")).toBe(false);
  });

  it("stores only a hash and clears on success", async () => {
    const fake = useAdmin(countIs(1));
    vi.spyOn(Math, "random").mockReturnValue(0.01); // also exercise the opportunistic cleanup
    await otp.registerOtpAttempt("Hash.Me@example.com", "203.0.113.3");
    const insert = fake.queries.find((q) => first(q) === "insert")!;
    const rows = insert.calls[0]![1][0] as Array<{ email_hash: string }>;
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ email_hash: otp.hashEmail("hash.me@example.com") });
    rows.forEach((row) => expect(row.email_hash).toMatch(/^[0-9a-f]{64}$/));
    expect(JSON.stringify(fake.queries)).not.toContain("example.com");
    expect(JSON.stringify(fake.queries)).not.toContain("203.0.113.3");
    expect(fake.queries.some((q) => first(q) === "delete")).toBe(true);

    await otp.clearOtpFailures("hash.me@example.com", "203.0.113.3");
    const clear = fake.queries.at(-1)!;
    expect(first(clear)).toBe("delete");
  });
});

describe("shared rate limiter", () => {
  it("asks Postgres with a hashed key and honours its answer", async () => {
    const fake = useAdmin(() => ({ data: [{ allowed: false, retry_after: 42 }] }));
    const limiter = createSharedRateLimiter({ name: "test-shared", limit: 3, windowMs: 60_000 });
    expect(await limiter.check("203.0.113.9")).toMatchObject({ ok: false, retryAfterSeconds: 42 });

    const call = fake.queries[0]!;
    expect(call.table).toBe("rpc:rate_limit_hit");
    const args = call.calls[0]![1][0] as { p_key: string; p_limit: number; p_window_seconds: number };
    expect(args).toMatchObject({ p_limit: 3, p_window_seconds: 60 });
    expect(args.p_key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(fake.queries)).not.toContain("203.0.113.9");
  });

  it("falls back to memory when the function is missing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useAdmin(() => ({ error: { message: "not found", code: "PGRST202" } }));
    const limiter = createSharedRateLimiter({ name: "test-fallback", limit: 1, windowMs: 60_000 });
    expect((await limiter.check("x")).ok).toBe(true);
    expect((await limiter.check("x")).ok).toBe(false);
  });

  it("uses memory without an admin client", async () => {
    const limiter = createSharedRateLimiter({ name: "test-memory", limit: 1, windowMs: 60_000 });
    expect((await limiter.check("y")).ok).toBe(true);
    expect((await limiter.check("y")).ok).toBe(false);
  });
});

describe("contact requests data", () => {
  const OWNER = "11111111-1111-4111-8111-111111111111";
  const valid = { name: "Lucía", email: "lucia@example.com", phone: null, company: "", message: "", consent: true as const };

  it("returns the owner when the card accepts requests", async () => {
    const fake = useAdmin(() => ({ data: OWNER }));
    expect(await contacts.submitContactRequest("alex", valid, "qr")).toEqual({ ok: true, ownerId: OWNER });
    expect(fake.queries[0]!.calls[0]![1][0]).toMatchObject({ p_slug: "alex", p_name: "Lucía", p_source: "qr" });
  });

  it("distinguishes closed cards from failures", async () => {
    useAdmin(() => ({ data: null }));
    expect(await contacts.submitContactRequest("alex", valid, "direct")).toEqual({ ok: false, reason: "closed" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    useAdmin(() => ({ error: { message: "down" } }));
    expect(await contacts.submitContactRequest("alex", valid, "direct")).toEqual({ ok: false, reason: "unavailable" });
    state.admin = null;
    expect(await contacts.submitContactRequest("alex", valid, "direct")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("lists, reports a pending migration and deletes by id", async () => {
    const row = {
      id: "22222222-2222-4222-8222-222222222222",
      profile_id: OWNER,
      name: "Lucía",
      email: "lucia@example.com",
      phone: null,
      company: "",
      message: "Hola",
      source: "qr",
      created_at: "2026-09-29T10:00:00Z",
    };
    const ok = fakeSupabase(() => ({ data: [row] }));
    expect(await contacts.listOwnContactRequests(ok.client)).toEqual({
      available: true,
      requests: [
        { id: row.id, name: "Lucía", email: row.email, phone: null, company: "", message: "Hola", source: "qr", createdAt: row.created_at },
      ],
    });
    const pending = fakeSupabase(() => ({ error: { message: "relation does not exist", code: "42P01" } }));
    expect(await contacts.listOwnContactRequests(pending.client)).toEqual({ available: false, requests: [] });

    const del = fakeSupabase(() => ({}));
    expect(await contacts.deleteContactRequest(del.client, "not-a-uuid")).toBe(false);
    expect(del.queries).toHaveLength(0);
    expect(await contacts.deleteContactRequest(del.client, row.id)).toBe(true);
  });
});

describe("email and captcha helpers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends plain-text email through Resend only when configured", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail({ to: "a@example.com", subject: "Hola", text: "x" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("PASSME_EMAIL_FROM", "PassMe <hola@example.com>");
    const sent = await sendEmail({ to: "a@example.com", subject: "Línea\r\nBcc: x", text: "cuerpo", replyTo: "b@example.com" });
    expect(sent).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ to: ["a@example.com"], subject: "Línea Bcc: x", text: "cuerpo", reply_to: "b@example.com" });
  });

  it("verifies Turnstile tokens only when a secret is set, failing closed", async () => {
    expect(await verifyCaptcha(null)).toBe(true);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    expect(await verifyCaptcha("")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true })));
    expect(await verifyCaptcha("token", "203.0.113.9")).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: false })));
    expect(await verifyCaptcha("token")).toBe(false);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await verifyCaptcha("token")).toBe(false);
  });
});

describe("Google Wallet sync", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const config = {
    issuerId: "3388000000012345678",
    serviceAccountEmail: "sa@x.iam.gserviceaccount.com",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    classSuffix: "passme_card_v1",
  };
  const input = { card: toPublicCard(DEMO_CARD), profileId: DEMO_CARD.id };

  function mockFetch(objectStatus: number, tokenOk = true) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.includes("oauth2")) {
          return new Response(JSON.stringify(tokenOk ? { access_token: "token-123" } : {}), { status: tokenOk ? 200 : 400 });
        }
        return new Response("{}", { status: objectStatus });
      }),
    );
    return calls;
  }

  it("updates an existing object with a bearer token", async () => {
    const calls = mockFetch(200);
    expect(await syncGoogleObject(config, input)).toBe("updated");
    const put = calls.find((c) => c.init?.method === "PUT")!;
    expect(put.url).toContain(encodeURIComponent(`${config.issuerId}.card-${DEMO_CARD.id}`));
    expect((put.init!.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
    expect(JSON.parse(put.init!.body as string).header.defaultValue.value).toBe("Alex Rivera");
  });

  it("treats 404 as 'never saved' and other failures as failed", async () => {
    mockFetch(404);
    expect(await syncGoogleObject(config, input)).toBe("not_saved");
    mockFetch(500);
    expect(await syncGoogleObject(config, input)).toBe("failed");
    mockFetch(200, false);
    expect(await syncGoogleObject(config, input)).toBe("failed");
  });
});
