import { afterEach, describe, expect, it, vi } from "vitest";
import { authMethods, isAppSession, isSessionMissingError } from "@/lib/auth/session-claims";
import { supabaseCookieOptions } from "@/lib/supabase/cookie-options";
import { getSessionUser, type TypedSupabaseClient } from "@/lib/supabase/server";

/*
 * Which sessions count. The shapes below are what GoTrue puts in the JWT:
 * `amr` entries are { method, timestamp } objects (older tokens: plain strings).
 */

const SUB = "6f1c1c1e-0000-4000-8000-000000000001";
const claims = (extra: Record<string, unknown>) => ({ sub: SUB, email: "ana@example.com", ...extra });

describe("authMethods", () => {
  it("reads both shapes of the amr claim", () => {
    expect(authMethods([{ method: "otp", timestamp: 1_700_000_000 }])).toEqual(["otp"]);
    expect(authMethods(["otp", "oauth"])).toEqual(["otp", "oauth"]);
    expect(authMethods([{ method: "otp" }, "password"])).toEqual(["otp", "password"]);
  });

  it("shrugs off anything else", () => {
    expect(authMethods(undefined)).toEqual([]);
    expect(authMethods(null)).toEqual([]);
    expect(authMethods("password")).toEqual([]);
    expect(authMethods({ method: "password" })).toEqual([]);
    expect(authMethods([null, 3, {}, { method: 4 }])).toEqual([]);
  });
});

describe("isAppSession", () => {
  it.each([
    ["an emailed code", claims({ amr: [{ method: "otp", timestamp: 1_700_000_000 }] })],
    ["the email button (magic link)", claims({ amr: [{ method: "magiclink", timestamp: 1_700_000_000 }] })],
    ["a confirmed sign-up", claims({ amr: [{ method: "email/signup", timestamp: 1_700_000_000 }] })],
    ["Google", claims({ amr: [{ method: "oauth", timestamp: 1_700_000_000 }], is_anonymous: false })],
    ["RFC 8176 strings", claims({ amr: ["otp"] })],
    ["a refreshed session that lists more than one method", claims({ amr: [{ method: "otp" }, { method: "token_refresh" }] })],
    ["a token without amr", claims({})],
  ])("accepts %s", (_name, value) => {
    expect(isAppSession(value)).toBe(true);
  });

  it.each([
    ["a password sign-in", claims({ amr: [{ method: "password", timestamp: 1_700_000_000 }] })],
    ["a password sign-in, string form", claims({ amr: ["password"] })],
    ["a password anywhere in the list", claims({ amr: [{ method: "otp" }, { method: "password" }] })],
    ["an anonymous user", claims({ is_anonymous: true, amr: [{ method: "anonymous" }] })],
    ["is_anonymous alone", claims({ is_anonymous: true })],
    ["the anonymous method alone", claims({ amr: [{ method: "anonymous" }] })],
  ])("rejects %s", (_name, value) => {
    expect(isAppSession(value)).toBe(false);
  });

  it("rejects claims without a subject", () => {
    expect(isAppSession(undefined)).toBe(false);
    expect(isAppSession(null)).toBe(false);
    expect(isAppSession({})).toBe(false);
    expect(isAppSession({ sub: "" })).toBe(false);
    expect(isAppSession({ sub: 7 })).toBe(false);
  });
});

describe("isSessionMissingError", () => {
  it("recognises 'nobody is signed in' and nothing else", () => {
    expect(isSessionMissingError({ name: "AuthSessionMissingError", message: "x" })).toBe(true);
    expect(isSessionMissingError({ message: "Auth session missing!" })).toBe(true);
    expect(isSessionMissingError({ name: "AuthInvalidJwtError", message: "Invalid JWT signature" })).toBe(false);
    expect(isSessionMissingError(null)).toBe(false);
  });
});

describe("getSessionUser", () => {
  afterEach(() => vi.restoreAllMocks());

  const clientWith = (result: { data: unknown; error: unknown }) =>
    ({ auth: { getClaims: async () => result } }) as unknown as TypedSupabaseClient;

  it("returns the verified user for a session from our own sign-in", async () => {
    const user = await getSessionUser(clientWith({ data: { claims: claims({ amr: [{ method: "otp" }] }) }, error: null }));
    expect(user).toEqual({ id: SUB, email: "ana@example.com" });
  });

  it("works for Google sessions and tokens without an email", async () => {
    const oauth = clientWith({ data: { claims: { sub: SUB, amr: [{ method: "oauth" }] } }, error: null });
    expect(await getSessionUser(oauth)).toEqual({ id: SUB, email: null });
  });

  it("refuses password and anonymous sessions, and says so in the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await getSessionUser(clientWith({ data: { claims: claims({ amr: [{ method: "password" }] }) }, error: null }))).toBeNull();
    expect(await getSessionUser(clientWith({ data: { claims: claims({ is_anonymous: true }) }, error: null }))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("is signed-out quietly when nobody is signed in", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await getSessionUser(clientWith({ data: null, error: null }))).toBeNull();
    const missing = { name: "AuthSessionMissingError", message: "Auth session missing!" };
    expect(await getSessionUser(clientWith({ data: null, error: missing }))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs a token that could not be verified instead of silently treating it as signed-out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bad = { name: "AuthInvalidJwtError", message: "Invalid JWT signature", status: 401 };
    expect(await getSessionUser(clientWith({ data: null, error: bad }))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("Invalid JWT signature");
  });
});

describe("supabaseCookieOptions", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("asks for Secure cookies in production only", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(supabaseCookieOptions()).toEqual({ secure: true });
    vi.stubEnv("NODE_ENV", "development");
    expect(supabaseCookieOptions()).toEqual({ secure: false });
  });
});
