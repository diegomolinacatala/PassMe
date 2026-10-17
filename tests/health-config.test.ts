import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAppleWalletConfig,
  getGoogleWalletConfig,
  hasValidCronSecret,
  resetConfigProblemReports,
} from "@/lib/config.server";

const SECRET = "c".repeat(32);
const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

beforeEach(() => resetConfigProblemReports());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

function stubSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
}

describe("hasValidCronSecret", () => {
  it("is closed without a secret, with a short one, or without the header", () => {
    expect(hasValidCronSecret(`Bearer ${SECRET}`)).toBe(false);
    vi.stubEnv("CRON_SECRET", "short");
    expect(hasValidCronSecret("Bearer short")).toBe(false);
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(hasValidCronSecret(null)).toBe(false);
    expect(hasValidCronSecret("")).toBe(false);
  });

  it("accepts exactly Bearer <secret>", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(hasValidCronSecret(`Bearer ${SECRET}`)).toBe(true);
    for (const wrong of [SECRET, `bearer ${SECRET}`, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, `Bearer ${"d".repeat(32)}`, `Basic ${SECRET}`, "x".repeat(5000)]) {
      expect(hasValidCronSecret(wrong), wrong.slice(0, 20)).toBe(false);
    }
  });
});

describe("/api/health", () => {
  const request = (authorization?: string) => new Request("https://passme.test/api/health", { headers: authorization ? { authorization } : {} });
  const load = async () => (await import("@/app/api/health/route")).GET;

  it("tells the public only whether the app is up on Supabase", async () => {
    stubSupabase();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("PASSME_SIGNING_SECRET", "s".repeat(40));
    const GET = await load();
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`]) {
      const response = GET(request(auth));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ ok: true });
    }
  });

  it("gives the integration detail to whoever holds the cron secret, and never a secret", async () => {
    stubSupabase();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_do_not_leak");
    vi.stubEnv("PASSME_SIGNING_SECRET", "s".repeat(40));
    const GET = await load();
    const response = GET(request(`Bearer ${SECRET}`));
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, supabase: true, supabaseSecretKey: true, signingSecret: true, appleWallet: false, googleWallet: false });
    expect(JSON.stringify(body)).not.toMatch(/sb_secret|do_not_leak|BEGIN/);
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("has no detail at all when CRON_SECRET isn't set", async () => {
    stubSupabase();
    const GET = await load();
    expect(await GET(request("Bearer ")).json()).toEqual({ ok: true });
  });

  it("is ok:false but still 200 outside production when Supabase is missing (demo mode, E2E)", async () => {
    const GET = await load();
    const response = GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false });
  });

  it("returns 503 in production without Supabase, logging the error once", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const GET = await load();
    for (let i = 0; i < 3; i += 1) {
      const response = GET(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]![0])).toContain("demo mode");
  });

  it("stays 200 in production when Supabase is configured, and in preview deployments without it", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    stubSupabase();
    expect((await load())(request()).status).toBe(200);
    vi.unstubAllEnvs();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.resetModules();
    const response = (await load())(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false });
  });
});

describe("unusable wallet credentials are reported once", () => {
  it("stays silent when a wallet simply isn't configured", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(getAppleWalletConfig()).toBeNull();
    expect(getGoogleWalletConfig()).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it("names the Apple variables that are set but unreadable or missing, never their values", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("APPLE_PASS_TYPE_ID", "pass.app.passme");
    vi.stubEnv("APPLE_TEAM_ID", "TEAM123456");
    vi.stubEnv("APPLE_PASS_CERT", "this-is-not-a-pem-SECRETMARKER");
    vi.stubEnv("APPLE_PASS_KEY", PEM);
    // APPLE_WWDR_CERT is missing.
    expect(getAppleWalletConfig()).toBeNull();
    expect(getAppleWalletConfig()).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    const line = String(error.mock.calls[0]![0]);
    expect(line).toContain("Apple Wallet");
    expect(line).toMatch(/"unusable":"APPLE_PASS_CERT"/);
    expect(line).toMatch(/"missing":"APPLE_WWDR_CERT"/);
    expect(line).not.toContain("SECRETMARKER");
    expect(line).not.toContain("TEAM123456");
  });

  it("reports a half-set Apple configuration (only the pass type id)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("APPLE_PASS_TYPE_ID", "pass.app.passme");
    expect(getAppleWalletConfig()).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]![0])).toContain("APPLE_TEAM_ID");
  });

  it("reports an unparseable Google service-account JSON and a mangled key", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "3388000000012345678");
    vi.stubEnv("GOOGLE_WALLET_SERVICE_ACCOUNT_JSON", "{ not json SECRETMARKER");
    expect(getGoogleWalletConfig()).toBeNull();
    expect(getGoogleWalletConfig()).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    const line = String(error.mock.calls[0]![0]);
    expect(line).toContain("Google Wallet");
    expect(line).toContain("GOOGLE_WALLET_SERVICE_ACCOUNT_JSON");
    expect(line).not.toContain("SECRETMARKER");

    resetConfigProblemReports();
    error.mockClear();
    vi.stubEnv("GOOGLE_WALLET_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "sa@x.iam.gserviceaccount.com", private_key: "garbage-key-SECRETMARKER" }));
    expect(getGoogleWalletConfig()).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]![0])).toContain("GOOGLE_WALLET_PRIVATE_KEY");
    expect(String(error.mock.calls[0]![0])).not.toContain("SECRETMARKER");
  });

  it("reports a Google setup that is only half there", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "3388000000012345678");
    expect(getGoogleWalletConfig()).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]![0])).toMatch(/"missing":"GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL,GOOGLE_WALLET_PRIVATE_KEY"/);
  });

  it("doesn't report a configuration that works", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "3388000000012345678");
    vi.stubEnv("GOOGLE_WALLET_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "sa@x.iam.gserviceaccount.com", private_key: PEM }));
    expect(getGoogleWalletConfig()).not.toBeNull();
    vi.stubEnv("APPLE_PASS_TYPE_ID", "pass.app.passme");
    vi.stubEnv("APPLE_TEAM_ID", "TEAM");
    vi.stubEnv("APPLE_PASS_CERT", PEM);
    vi.stubEnv("APPLE_PASS_KEY", PEM);
    vi.stubEnv("APPLE_WWDR_CERT", PEM);
    expect(getAppleWalletConfig()).not.toBeNull();
    expect(error).not.toHaveBeenCalled();
  });
});
