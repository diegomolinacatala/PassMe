import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidAvatarPath, newAvatarPath } from "@/lib/card/avatar";
import { decodePem, getAppleWalletConfig, getConfigStatus, getGoogleWalletConfig, getSigningSecret } from "@/lib/config.server";
import { avatarPublicUrl, getSiteUrl, profileUrl } from "@/lib/env";
import { parseApplePassAuth } from "@/lib/data/wallet";
import { signHandoffToken, verifyHandoffToken, HANDOFF_TTL_SECONDS } from "@/lib/pass/handoff";
import { createRateLimiter } from "@/lib/rate-limit";
import { clientRateKey, getClientIp, isBot, parseVisitSource, readTextLimited, safeNextPath } from "@/lib/request";

const USER = "11111111-1111-4111-8111-111111111111";
const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

afterEach(() => vi.unstubAllEnvs());

describe("avatar paths", () => {
  it("accepts only files directly inside the owner's folder", () => {
    expect(isValidAvatarPath(`${USER}/avatar-abc.jpg`, USER)).toBe(true);
    expect(isValidAvatarPath(newAvatarPath(USER, 1_700_000_000_000), USER)).toBe(true);
    expect(isValidAvatarPath(`${USER}/../x.jpg`, USER)).toBe(false);
    expect(isValidAvatarPath(`${USER}/a/b.jpg`, USER)).toBe(false);
    expect(isValidAvatarPath(`other/avatar.jpg`, USER)).toBe(false);
    expect(isValidAvatarPath(`${USER}/avatar.gif`, USER)).toBe(false);
  });
});

describe("env helpers", () => {
  it("resolves the site URL from explicit config, then Vercel, then localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://passme.app/");
    expect(getSiteUrl()).toBe("https://passme.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "passme.vercel.app");
    expect(getSiteUrl()).toBe("https://passme.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("builds profile and avatar URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://passme.app");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    expect(profileUrl("alex", "qr")).toBe("https://passme.app/u/alex?src=qr");
    expect(avatarPublicUrl(`${USER}/avatar-1.jpg`)).toBe(
      `https://abc.supabase.co/storage/v1/object/public/avatars/${USER}/avatar-1.jpg`,
    );
    expect(avatarPublicUrl(null)).toBeNull();
  });
});

describe("server config", () => {
  it("decodes raw, escaped and base64 PEM", () => {
    expect(decodePem(PEM)).toBe(PEM);
    expect(decodePem(PEM.replace(/\n/g, "\\n"))).toBe(PEM);
    expect(decodePem(Buffer.from(PEM).toString("base64"))).toBe(PEM);
    expect(decodePem("garbage")).toBeNull();
    expect(decodePem(undefined)).toBeNull();
  });

  it("requires every Apple variable and enables the web service only on https", () => {
    expect(getAppleWalletConfig()).toBeNull();
    vi.stubEnv("APPLE_PASS_TYPE_ID", "pass.app.passme");
    vi.stubEnv("APPLE_TEAM_ID", "TEAM");
    vi.stubEnv("APPLE_PASS_CERT", PEM);
    vi.stubEnv("APPLE_PASS_KEY", PEM);
    vi.stubEnv("APPLE_WWDR_CERT", PEM);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(getAppleWalletConfig()?.webServiceEnabled).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://passme.app");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_x");
    expect(getAppleWalletConfig()?.webServiceEnabled).toBe(true);
    vi.stubEnv("APPLE_WALLET_WEB_SERVICE", "false");
    expect(getAppleWalletConfig()?.webServiceEnabled).toBe(false);
  });

  it("reads Google credentials from a service-account JSON (raw or base64)", () => {
    const json = JSON.stringify({ client_email: "sa@x.iam.gserviceaccount.com", private_key: PEM });
    vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "338800");
    vi.stubEnv("GOOGLE_WALLET_SERVICE_ACCOUNT_JSON", Buffer.from(json).toString("base64"));
    expect(getGoogleWalletConfig()).toMatchObject({ serviceAccountEmail: "sa@x.iam.gserviceaccount.com", privateKey: PEM });
    vi.stubEnv("GOOGLE_WALLET_SERVICE_ACCOUNT_JSON", json);
    expect(getGoogleWalletConfig()?.classSuffix).toBe("passme_card_v1");
  });

  it("rejects short signing secrets and reports status without secrets", () => {
    vi.stubEnv("PASSME_SIGNING_SECRET", "short");
    expect(getSigningSecret()).toBeNull();
    const status = getConfigStatus();
    expect(Object.values(status).filter((v) => typeof v === "string")).toEqual([status.siteUrl]);
  });
});

describe("handoff tokens", () => {
  it("round-trips and expires", async () => {
    vi.stubEnv("PASSME_SIGNING_SECRET", "x".repeat(40));
    const token = await signHandoffToken(USER);
    expect(await verifyHandoffToken(token)).toBe(USER);

    const old = await signHandoffToken(USER, new Date(Date.now() - (HANDOFF_TTL_SECONDS + 60) * 1000));
    expect(await verifyHandoffToken(old)).toBeNull();
    expect(await verifyHandoffToken(`${token}x`)).toBeNull();
    expect(await verifyHandoffToken(null)).toBeNull();
  });

  it("is disabled without a secret", async () => {
    expect(await signHandoffToken(USER)).toBeNull();
  });

  it("rejects tokens signed with another secret", async () => {
    vi.stubEnv("PASSME_SIGNING_SECRET", "a".repeat(40));
    const token = await signHandoffToken(USER);
    vi.stubEnv("PASSME_SIGNING_SECRET", "b".repeat(40));
    expect(await verifyHandoffToken(token)).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.check("ip", 0).ok).toBe(true);
    expect(limiter.check("ip", 10).ok).toBe(true);
    const blocked = limiter.check("ip", 20);
    expect(blocked).toEqual({ ok: false, remaining: 0, retryAfterSeconds: 1 });
    expect(limiter.check("other", 20).ok).toBe(true);
    expect(limiter.check("ip", 1001).ok).toBe(true);
  });
});

describe("request helpers", () => {
  it("extracts the client IP", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(getClientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(getClientIp(new Headers())).toBe("unknown");
    // Vercel's own header wins over a client-supplied X-Forwarded-For.
    expect(getClientIp(new Headers({ "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "1.2.3.4" }))).toBe("9.9.9.9");
  });

  it("buckets IPv6 clients by their /64 for rate limits", () => {
    const key = (ip: string) => clientRateKey(new Headers({ "x-forwarded-for": ip }));
    expect(key("2001:db8:abcd:12:1::7")).toBe("2001:db8:abcd:12::/64");
    expect(key("2001:0db8:abcd:0012:ffff:ffff:ffff:ffff")).toBe("2001:db8:abcd:12::/64");
    expect(key("::1")).toBe("0:0:0:0::/64");
    expect(key("203.0.113.9")).toBe("203.0.113.9");
    expect(key("not:an:ip:1:2:3:4:5:6")).toBe("not:an:ip:1:2:3:4:5:6");
  });

  it("reads request bodies only up to a byte limit", async () => {
    const post = (body: BodyInit, headers: Record<string, string> = {}) =>
      new Request("https://passme.test/api", { method: "POST", body, headers, duplex: "half" } as RequestInit);
    expect(await readTextLimited(post("hola"), 10)).toBe("hola");
    expect(await readTextLimited(post("x".repeat(11)), 10)).toBeNull();
    expect(await readTextLimited(post("hola", { "content-length": "999" }), 10)).toBeNull();
    // A streamed body without Content-Length is cut off as well.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i += 1) controller.enqueue(new TextEncoder().encode("xxxx"));
        controller.close();
      },
    });
    expect(await readTextLimited(post(stream), 10)).toBeNull();
  });

  it("detects bots and link previews", () => {
    expect(isBot("WhatsApp/2.23")).toBe(true);
    expect(isBot("Googlebot/2.1")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1")).toBe(false);
  });

  it("only allows safe relative redirects", () => {
    expect(safeNextPath("/dashboard?x=1")).toBe("/dashboard?x=1");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath(null, "/")).toBe("/");
  });

  it("parses visit sources", () => {
    expect(parseVisitSource("qr")).toBe("qr");
    expect(parseVisitSource("evil")).toBe("direct");
  });

  it("parses Apple Wallet auth headers", () => {
    expect(parseApplePassAuth(`ApplePass ${"a1".repeat(16)}`)).toBe("a1".repeat(16));
    expect(parseApplePassAuth("Bearer abc")).toBeNull();
    expect(parseApplePassAuth("ApplePass short")).toBeNull();
    expect(parseApplePassAuth(null)).toBeNull();
  });
});
