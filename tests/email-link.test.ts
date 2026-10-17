import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The email's button: /auth/confirm must not spend the token on GET (mail
 * scanners open every link); /auth/entrar verifies it on the person's tap.
 */

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}

const state = vi.hoisted(() => ({ supabase: null as unknown, ip: "203.0.113.1" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": state.ip }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => state.supabase }));

const { GET } = await import("@/app/auth/confirm/route");
const { confirmEmailLinkAction } = await import("@/app/auth/entrar/actions");

const HASH = "a".repeat(56);

let ipCounter = 0;
beforeEach(() => {
  state.supabase = null;
  // A fresh client per test: the limiter counts per IP.
  ipCounter += 1;
  state.ip = `203.0.113.${ipCounter}`;
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof Redirect)) throw new Error(`expected a redirect, got ${String(error)}`);
  return error.url;
}

describe("/auth/confirm", () => {
  it("hands the link to the one-tap page without verifying anything", async () => {
    const verifyOtp = vi.fn();
    state.supabase = { auth: { verifyOtp } };
    const response = await GET(new NextRequest(`https://getpassme.com/auth/confirm?token_hash=${HASH}&type=email&next=/dashboard`));
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth/entrar");
    expect(location.searchParams.get("token_hash")).toBe(HASH);
    expect(location.searchParams.get("next")).toBe("/dashboard");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("only accepts the link type the email template sends", async () => {
    for (const type of ["recovery", "magiclink", "signup", "invite", "email_change"]) {
      const response = await GET(new NextRequest(`https://getpassme.com/auth/confirm?token_hash=${HASH}&type=${type}`));
      expect(new URL(response.headers.get("location")!).pathname, type).toBe("/login");
    }
  });

  it("sends malformed links to the login screen", async () => {
    const response = await GET(new NextRequest(`https://getpassme.com/auth/confirm?token_hash=${HASH}&type=nope`));
    expect(new URL(response.headers.get("location")!).pathname + new URL(response.headers.get("location")!).search).toBe(
      "/login?error=link",
    );
  });
});

describe("confirmEmailLinkAction", () => {
  it("verifies the token on the tap and goes to a same-site `next`", async () => {
    const verifyOtp = vi.fn(async () => ({ error: null }));
    state.supabase = { auth: { verifyOtp } };
    expect(await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "email", next: "/dashboard" })))).toBe("/dashboard");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: HASH });
    expect(await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "email", next: "//evil.test" })))).toBe(
      "/dashboard",
    );
  });

  it("explains expired or reused links", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.supabase = { auth: { verifyOtp: async () => ({ error: { message: "expired" } }) } };
    expect(await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "email" })))).toBe("/login?error=link");
  });

  it("does not sign anyone in with a recovery or invite token", async () => {
    const verifyOtp = vi.fn();
    state.supabase = { auth: { verifyOtp } };
    for (const type of ["recovery", "invite", "email_change", "magiclink", "signup"]) {
      expect(await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type }))), type).toBe("/login?error=link");
    }
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("is not an unthrottled way to try codes: 20 taps per client every 10 minutes", async () => {
    const verifyOtp = vi.fn(async () => ({ error: { message: "expired" } }));
    state.supabase = { auth: { verifyOtp } };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < 20; i += 1) await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "email" })));
    expect(verifyOtp).toHaveBeenCalledTimes(20);
    expect(await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "email" })))).toBe("/login?error=link");
    expect(verifyOtp).toHaveBeenCalledTimes(20);
    // Someone else, somewhere else, still gets through.
    state.ip = "198.51.100.77";
    await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "email" })));
    expect(verifyOtp).toHaveBeenCalledTimes(21);
  });

  it("rejects forged fields before calling Supabase", async () => {
    const verifyOtp = vi.fn();
    state.supabase = { auth: { verifyOtp } };
    expect(await redirectOf(confirmEmailLinkAction(form({ token_hash: "<script>", type: "email" })))).toBe("/login?error=link");
    expect(await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "sms" })))).toBe("/login?error=link");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
