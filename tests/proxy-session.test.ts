import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The proxy's /dashboard gate and cookie options. @supabase/ssr is replaced by
 * a client that answers with the claims a test scripts.
 */

const state = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  error: null as { name?: string; message: string } | null,
  created: [] as Array<{ url: string; key: string; options: { cookieOptions?: Record<string, unknown> } }>,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (url: string, key: string, options: { cookieOptions?: Record<string, unknown> }) => {
    state.created.push({ url, key, options });
    return { auth: { getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null, error: state.error }) } };
  },
}));

const { proxy } = await import("@/proxy");

const SUB = "6f1c1c1e-0000-4000-8000-000000000001";
const get = (path: string) => proxy(new NextRequest(`https://getpassme.com${path}`));
const redirectTarget = (response: Response) => {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname + new URL(location).search : null;
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  state.claims = null;
  state.error = null;
  state.created.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the /dashboard gate", () => {
  it("sends visitors to the login, remembering where they were going", async () => {
    const response = await get("/dashboard?nueva=1");
    expect(response.status).toBe(307);
    expect(redirectTarget(response)).toBe("/login?next=%2Fdashboard%3Fnueva%3D1");
  });

  it.each([
    ["an emailed code", [{ method: "otp", timestamp: 1 }]],
    ["the email button", [{ method: "magiclink", timestamp: 1 }]],
    ["Google", [{ method: "oauth", timestamp: 1 }]],
  ])("lets in a session from %s", async (_name, amr) => {
    state.claims = { sub: SUB, amr };
    const response = await get("/dashboard");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("content-security-policy")).toContain("script-src");
  });

  it("does not let in a password session", async () => {
    state.claims = { sub: SUB, amr: [{ method: "password", timestamp: 1 }] };
    expect(redirectTarget(await get("/dashboard"))).toMatch(/^\/login\?next=/);
  });

  it("does not let in an anonymous session", async () => {
    state.claims = { sub: SUB, is_anonymous: true, amr: [{ method: "anonymous", timestamp: 1 }] };
    expect(redirectTarget(await get("/dashboard"))).toMatch(/^\/login\?next=/);
  });

  it("keeps signed-in people off the login page, but not password sessions (they need a real sign-in)", async () => {
    state.claims = { sub: SUB, amr: [{ method: "otp" }] };
    expect(redirectTarget(await get("/login"))).toBe("/dashboard");
    state.claims = { sub: SUB, amr: [{ method: "password" }] };
    expect((await get("/login")).headers.get("location")).toBeNull();
  });
});

describe("a token that can't be verified", () => {
  it("is signed-out, and logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.error = { name: "AuthInvalidJwtError", message: "Invalid JWT signature" };
    expect(redirectTarget(await get("/dashboard"))).toMatch(/^\/login/);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("/dashboard");
  });

  it("stays quiet when there simply is no session", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.error = { name: "AuthSessionMissingError", message: "Auth session missing!" };
    await get("/dashboard");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("the session cookie options", () => {
  it("are Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await get("/");
    expect(state.created[0]!.options.cookieOptions).toEqual({ secure: true });
  });

  it("are not forced to Secure in development (plain http://localhost)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await get("/");
    expect(state.created[0]!.options.cookieOptions).toEqual({ secure: false });
  });
});
