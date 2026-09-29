import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_LOGIN_CODE, RESEND_COOLDOWN_SECONDS } from "@/lib/auth/code";

/*
 * The sign-in flow as the code screen drives it: send → code step, resend,
 * verify → redirect (creating the /crear card in the same request).
 */

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}

const state = vi.hoisted(() => ({
  ip: "203.0.113.1",
  supabase: null as unknown,
  createCard: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": state.ip }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => state.supabase,
  getSessionUser: async () => null,
}));
vi.mock("@/lib/data/cards", () => ({ createCardFromDraft: state.createCard }));

const { authAction } = await import("@/app/login/actions");
type AuthState = Parameters<typeof authAction>[0];

let ipCounter = 0;
beforeEach(() => {
  // Fresh client per test: the rate limiters (memory fallback here) are per IP.
  ipCounter += 1;
  state.ip = `203.0.113.${ipCounter}`;
  state.supabase = null;
  state.createCard.mockReset();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function fakeAuth(auth: Record<string, unknown>) {
  state.supabase = { auth };
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof Redirect)) throw new Error(`expected a redirect, got ${String(error)}`);
  return error.url;
}

const EMAIL_STEP: AuthState = { step: "email" };
const codeStep = (extra: Partial<Extract<AuthState, { step: "code" }>> = {}): AuthState => ({
  step: "code",
  email: "ana@example.com",
  sentAt: 111,
  resendIn: 60,
  ...extra,
});

describe("sending the code", () => {
  it("rejects an invalid email and keeps what was typed", async () => {
    const result = await authAction(EMAIL_STEP, form({ intent: "send", email: "ana@" }));
    expect(result).toMatchObject({ step: "email", email: "ana@", error: "Introduce un email válido." });
  });

  it("moves to the code step once the email is sent", async () => {
    const signInWithOtp = vi.fn(async () => ({ error: null }));
    fakeAuth({ signInWithOtp });
    const result = await authAction(EMAIL_STEP, form({ intent: "send", email: " Ana@Example.com ", next: "/dashboard" }));
    expect(result).toMatchObject({ step: "code", email: "ana@example.com", resendIn: RESEND_COOLDOWN_SECONDS });
    expect(result.step === "code" && result.notice).toBeFalsy();
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "ana@example.com" }));
  });

  it("treats 'wait N seconds' as a code already on its way", async () => {
    fakeAuth({
      signInWithOtp: async () => ({
        error: { status: 429, message: "For security purposes, you can only request this after 42 seconds." },
      }),
    });
    const result = await authAction(EMAIL_STEP, form({ intent: "send", email: "ana@example.com" }));
    expect(result).toMatchObject({ step: "code", resendIn: 42, notice: expect.stringMatching(/usa ese/) });
  });

  it("explains other send failures on the email step", async () => {
    fakeAuth({ signInWithOtp: async () => ({ error: { status: 429, message: "email rate limit exceeded" } }) });
    expect(await authAction(EMAIL_STEP, form({ intent: "send", email: "ana@example.com" }))).toMatchObject({
      step: "email",
      error: expect.stringMatching(/demasiados emails/),
    });
    fakeAuth({ signInWithOtp: async () => ({ error: { status: 400, message: "captcha verification process failed" } }) });
    expect(await authAction(EMAIL_STEP, form({ intent: "send", email: "ana@example.com" }))).toMatchObject({
      error: expect.stringMatching(/anti-spam/),
    });
  });

  it("a resend restarts the countdown, and a failed one stays on the code step", async () => {
    fakeAuth({ signInWithOtp: async () => ({ error: null }) });
    const resent = await authAction(codeStep(), form({ intent: "resend", email: "ana@example.com" }));
    expect(resent).toMatchObject({ step: "code", notice: expect.stringMatching(/otro código/) });
    expect(resent.step === "code" && resent.sentAt).not.toBe(111);

    fakeAuth({ signInWithOtp: async () => ({ error: { status: 500, message: "smtp down" } }) });
    const failed = await authAction(codeStep(), form({ intent: "resend", email: "ana@example.com" }));
    expect(failed).toMatchObject({ step: "code", sentAt: 111, error: expect.stringMatching(/No hemos podido/) });
  });

  it("stops after too many emails from one client", async () => {
    fakeAuth({ signInWithOtp: async () => ({ error: null }) });
    for (let i = 0; i < 10; i += 1) await authAction(EMAIL_STEP, form({ intent: "send", email: "ana@example.com" }));
    expect(await authAction(EMAIL_STEP, form({ intent: "send", email: "ana@example.com" }))).toMatchObject({
      step: "email",
      error: expect.stringMatching(/Demasiados intentos/),
    });
  });

  it("simulates the email in demo mode", async () => {
    const result = await authAction(EMAIL_STEP, form({ intent: "send", email: "ana@example.com" }));
    expect(result).toMatchObject({ step: "code", notice: expect.stringContaining(DEMO_LOGIN_CODE) });
  });
});

describe("checking the code", () => {
  it("rejects a wrong code without restarting the countdown", async () => {
    fakeAuth({ verifyOtp: async () => ({ data: { user: null }, error: { message: "Token has expired or is invalid" } }) });
    const result = await authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: "1234 5678" }));
    expect(result).toMatchObject({ step: "code", sentAt: 111, resendIn: 60, rejected: true, error: "Código incorrecto o caducado." });
  });

  it("asks for digits before calling Supabase", async () => {
    const verifyOtp = vi.fn();
    fakeAuth({ verifyOtp });
    const result = await authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: "12" }));
    expect(result).toMatchObject({ step: "code", error: expect.stringMatching(/cifras/) });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("signs in and goes to `next`", async () => {
    const verifyOtp = vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null }));
    fakeAuth({ verifyOtp });
    const url = await redirectOf(authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: "12345678", next: "/dashboard" })));
    expect(url).toBe("/dashboard");
    expect(verifyOtp).toHaveBeenCalledWith({ email: "ana@example.com", token: "12345678", type: "email" });
  });

  it("never redirects off-site", async () => {
    fakeAuth({ verifyOtp: async () => ({ data: { user: { id: "u1" } }, error: null }) });
    const url = await redirectOf(
      authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: "12345678", next: "//evil.test" })),
    );
    expect(url).toBe("/dashboard");
  });

  it("creates the /crear card in the same request and shows the welcome", async () => {
    fakeAuth({ verifyOtp: async () => ({ data: { user: { id: "u1" } }, error: null }) });
    state.createCard.mockResolvedValue({ ok: true, created: true, card: { slug: "ana" } });
    const draft = JSON.stringify({ fullName: "Ana", email: "ana@example.com", theme: "cafe", patternSeed: 7 });
    const url = await redirectOf(
      authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: "12345678", draft, from: "alex" })),
    );
    expect(url).toBe("/dashboard?nueva=1&de=alex");
    expect(state.createCard).toHaveBeenCalledWith(state.supabase, "u1", expect.objectContaining({ fullName: "Ana" }));
  });

  it("goes to the editor when the account already had a card", async () => {
    fakeAuth({ verifyOtp: async () => ({ data: { user: { id: "u1" } }, error: null }) });
    state.createCard.mockResolvedValue({ ok: true, created: false, card: { slug: "ana" } });
    const draft = JSON.stringify({ fullName: "Ana", email: "ana@example.com" });
    expect(await redirectOf(authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: "12345678", draft })))).toBe(
      "/dashboard?existente=1",
    );
  });

  it("still shows the welcome when another tab created the card a moment ago", async () => {
    fakeAuth({ verifyOtp: async () => ({ data: { user: { id: "u1" } }, error: null }) });
    state.createCard.mockResolvedValue({ ok: true, created: false, card: { slug: "ana", updatedAt: new Date().toISOString() } });
    const draft = JSON.stringify({ fullName: "Ana", email: "ana@example.com" });
    expect(
      await redirectOf(authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: "12345678", draft, from: "alex" }))),
    ).toBe("/dashboard?nueva=1&de=alex");
  });

  it("a database error after the code was spent leads back to the form, not an error page", async () => {
    fakeAuth({ verifyOtp: async () => ({ data: { user: { id: "u1" } }, error: null }) });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.createCard.mockRejectedValue(new Error("Could not load profile: timeout"));
    const draft = JSON.stringify({ fullName: "Ana", email: "ana@example.com" });
    expect(await redirectOf(authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: "12345678", draft })))).toBe(
      "/crear",
    );
  });

  it("sends an unusable draft back to the form, which still has it", async () => {
    fakeAuth({ verifyOtp: async () => ({ data: { user: { id: "u1" } }, error: null }) });
    const draft = JSON.stringify({ fullName: "" });
    const url = await redirectOf(
      authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: "12345678", draft, from: "alex" })),
    );
    expect(url).toBe("/crear?de=alex");
    const broken = await redirectOf(
      authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: "12345678", draft: "{oops", from: "alex" })),
    );
    expect(broken).toBe("/crear?de=alex");
    expect(state.createCard).not.toHaveBeenCalled();
  });

  it("accepts only the demo code in demo mode", async () => {
    expect(await authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: "11111111" }))).toMatchObject({
      rejected: true,
    });
    const url = await redirectOf(authAction(codeStep(), form({ intent: "verify", email: "ana@example.com", code: DEMO_LOGIN_CODE, draft: "{}" })));
    expect(url).toBe("/dashboard?nueva=1");
  });
});
