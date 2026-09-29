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

const state = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => state.supabase }));

const { GET } = await import("@/app/auth/confirm/route");
const { confirmEmailLinkAction } = await import("@/app/auth/entrar/actions");

const HASH = "a".repeat(56);

beforeEach(() => {
  state.supabase = null;
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

  it("rejects forged fields before calling Supabase", async () => {
    const verifyOtp = vi.fn();
    state.supabase = { auth: { verifyOtp } };
    expect(await redirectOf(confirmEmailLinkAction(form({ token_hash: "<script>", type: "email" })))).toBe("/login?error=link");
    expect(await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "sms" })))).toBe("/login?error=link");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
