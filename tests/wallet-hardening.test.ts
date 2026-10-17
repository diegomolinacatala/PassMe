import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileRow } from "@/lib/supabase/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { fakeSupabase, first, type Handler, type RecordedQuery } from "./helpers/fake-supabase";
import { createTestCerts, type TestCerts } from "./helpers/test-certs";

const USER = "11111111-1111-4111-8111-111111111111";
const TOKEN = "t".repeat(64);
const PASS_TYPE = "pass.app.passme.test";

// --- module mocks -------------------------------------------------------------
const state: { admin: TypedSupabaseClient | null; sessionUserId: string | null } = { admin: null, sessionUserId: null };

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => state.admin }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => (state.sessionUserId ? {} : null),
  getSessionUser: async () => (state.sessionUserId ? { id: state.sessionUserId, email: "a@example.com" } : null),
}));
const pushes = vi.hoisted(() => ({ sendPassUpdatePushes: vi.fn() }));
vi.mock("@/lib/pass/apns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pass/apns")>()),
  sendPassUpdatePushes: pushes.sendPassUpdatePushes,
}));
const google = vi.hoisted(() => ({ syncGoogleObject: vi.fn() }));
vi.mock("@/lib/pass/google", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pass/google")>()),
  syncGoogleObject: google.syncGoogleObject,
}));

const service = await import("@/lib/pass/service");
const webService = await import("@/lib/pass/web-service");
const { passErrorResponse } = await import("@/lib/pass/http");
const { sendPassUpdatePushes: realSendPushes, isDeadTokenOutcome } = await vi.importActual<typeof import("@/lib/pass/apns")>("@/lib/pass/apns");
const passRoute = await import("@/app/api/wallet/v1/passes/[passTypeId]/[serialNumber]/route");
const registrationRoute = await import("@/app/api/wallet/v1/devices/[deviceLibraryId]/registrations/[passTypeId]/[serialNumber]/route");
const serialsRoute = await import("@/app/api/wallet/v1/devices/[deviceLibraryId]/registrations/[passTypeId]/route");

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: USER,
    slug: "alex",
    full_name: "Alex Rivera",
    headline: "Designer",
    company: "Norte",
    location: "Valencia",
    pronouns: "",
    bio: "",
    accent_color: "#2340F5",
    detail_color: null,
    pattern: "arco",
    pattern_seed: 42,
    typeface: "clasica",
    avatar_path: null,
    links: [{ id: "l-email-1", kind: "email", value: "alex@example.com", visible: true }],
    is_published: true,
    accepts_contact_requests: false,
    accepts_meeting_requests: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    ...overrides,
  };
}

function installAdmin(handler: Handler) {
  const fake = fakeSupabase(handler);
  state.admin = fake.client;
  return fake;
}

/** Rate-limit RPCs answer from `rpc`; every other table from `tables`. */
function walletAdmin(options: {
  profile?: ProfileRow | null;
  token?: unknown;
  /** Called with the limit of the limiter asked about (300 = per address, 60 = per pass). */
  allow?: (limit: number) => boolean;
  tableError?: string;
} = {}) {
  const rateCalls: number[] = [];
  const fake = installAdmin((q: RecordedQuery) => {
    if (q.table === "rpc:rate_limit_hit") {
      const args = q.calls[0]![1][0] as { p_limit: number };
      rateCalls.push(args.p_limit);
      const allowed = options.allow ? options.allow(args.p_limit) : true;
      return { data: [{ allowed, retry_after: allowed ? 0 : 17 }] };
    }
    if (q.table === options.tableError) return { error: { message: "db is down" } };
    if (q.table === "wallet_pass_secrets") return { data: options.token === undefined ? { apple_auth_token: TOKEN } : options.token };
    if (q.table === "profiles") return { data: options.profile === undefined ? profile() : options.profile };
    // A device's serial list is a plain select; registering looks up one row with maybeSingle().
    if (q.table === "apple_pass_registrations" && !q.calls.some(([method]) => method === "maybeSingle") && first(q) === "select") return { data: [] };
    return { data: null };
  });
  return { ...fake, rateCalls };
}

let certs: TestCerts;
beforeAll(() => {
  certs = createTestCerts();
}, 60_000);

function stubApple() {
  vi.stubEnv("APPLE_PASS_TYPE_ID", PASS_TYPE);
  vi.stubEnv("APPLE_TEAM_ID", "TEAMID1234");
  vi.stubEnv("APPLE_PASS_CERT", Buffer.from(certs.signerCert).toString("base64"));
  vi.stubEnv("APPLE_PASS_KEY", Buffer.from(certs.signerKey).toString("base64"));
  vi.stubEnv("APPLE_WWDR_CERT", Buffer.from(certs.wwdr).toString("base64"));
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://passme.test");
}

function stubSupabasePublic() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
}

function stubGoogle() {
  vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "3388000000012345678");
  vi.stubEnv(
    "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON",
    JSON.stringify({ client_email: "sa@x.iam.gserviceaccount.com", private_key: certs.signerKey }),
  );
}

beforeEach(() => {
  state.admin = null;
  state.sessionUserId = null;
  pushes.sendPassUpdatePushes.mockReset();
  google.syncGoogleObject.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const at = (auth: string | undefined = `ApplePass ${TOKEN}`, extra: Record<string, string> = {}) => ({
  headers: { ...(auth ? { authorization: auth } : {}), "x-vercel-forwarded-for": "203.0.113.9", ...extra },
});
const passRequest = (extra: Record<string, string> = {}, auth?: string) =>
  new Request(`https://passme.test/api/wallet/v1/passes/${PASS_TYPE}/${USER}`, at(auth, extra)) as never;
const passJson = async (response: Response) =>
  JSON.parse(await (await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()))).file("pass.json")!.async("string"));
const passParams = (passTypeId = PASS_TYPE, serialNumber = USER) => ({ params: Promise.resolve({ passTypeId, serialNumber }) }) as never;

// --- the HTTP/2 push client against a scripted fake APNs ------------------------
describe("APNs responses", () => {
  const token = (byte: string) => byte.repeat(32);
  const SCRIPT: Record<string, { status: number; body: string }> = {
    [token("aa")]: { status: 200, body: "" },
    [token("bb")]: { status: 410, body: '{"reason":"Unregistered"}' },
    [token("cc")]: { status: 400, body: '{"reason":"BadDeviceToken"}' },
    [token("dd")]: { status: 400, body: '{"reason":"BadTopic"}' },
    [token("ee")]: { status: 403, body: '{"reason":"InvalidProviderToken"}' },
    [token("ff")]: { status: 429, body: '{"reason":"TooManyRequests"}' },
    [token("11")]: { status: 500, body: '{"reason":"InternalServerError"}' },
    [token("22")]: { status: 400, body: "<html>not json</html>" },
  };

  it("classifies which answers mean the device token is dead", () => {
    expect(isDeadTokenOutcome({ status: 410, reason: "Unregistered" })).toBe(true);
    expect(isDeadTokenOutcome({ status: 410, reason: "unknown" })).toBe(true);
    expect(isDeadTokenOutcome({ status: 400, reason: "BadDeviceToken" })).toBe(true);
    for (const outcome of [
      { status: 400, reason: "BadTopic" },
      { status: 400, reason: "DeviceTokenNotForTopic" },
      { status: 400, reason: "unknown" },
      { status: 403, reason: "InvalidProviderToken" },
      { status: 429, reason: "TooManyRequests" },
      { status: 500, reason: "InternalServerError" },
      { status: 0, reason: "timeout" },
      { status: 200, reason: "ok" },
    ]) {
      expect(isDeadTokenOutcome(outcome), JSON.stringify(outcome)).toBe(false);
    }
  });

  it("keeps registrations unless APNs said 410 or 400 BadDeviceToken, and counts every outcome", async () => {
    stubApple();
    const seenTopics = new Set<string>();
    const server = http2.createSecureServer({ key: certs.signerKey, cert: certs.signerCert });
    server.on("stream", (stream, headers) => {
      const path = String(headers[":path"]);
      seenTopics.add(String(headers["apns-topic"]));
      const answer = SCRIPT[path.split("/").pop()!] ?? { status: 404, body: "" };
      stream.respond({ ":status": answer.status, "content-type": "application/json" });
      stream.end(answer.body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const previousTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // the fake APNs uses the test certificate
    try {
      const { getAppleWalletConfig } = await import("@/lib/config.server");
      const config = { ...getAppleWalletConfig()!, apnsHost: `https://127.0.0.1:${(server.address() as AddressInfo).port}` };
      const summary = await realSendPushes(config, Object.keys(SCRIPT));

      expect(summary.sent).toBe(1);
      expect(summary.failed).toBe(7);
      // Only the dead device tokens lose their registration; a bad topic, bad certificate, throttling or an outage doesn't.
      expect(summary.invalidTokens.sort()).toEqual([token("bb"), token("cc")].sort());
      expect(summary.outcomes).toEqual({
        "200:ok": 1,
        "410:Unregistered": 1,
        "400:BadDeviceToken": 1,
        "400:BadTopic": 1,
        "403:InvalidProviderToken": 1,
        "429:TooManyRequests": 1,
        "500:InternalServerError": 1,
        "400:unknown": 1,
      });
      expect([...seenTopics]).toEqual([PASS_TYPE]);
    } finally {
      if (previousTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTls;
      await new Promise((resolve) => server.close(resolve));
    }
  }, 20_000);
});

// --- what notifyWalletsOfUpdate reports and deletes -----------------------------
describe("notifyWalletsOfUpdate logging", () => {
  const dead = "bb".repeat(32);

  function pushAdmin(order: string[]) {
    return installAdmin((q) => {
      if (first(q) === "delete") {
        order.push("delete");
        return {};
      }
      return { data: [{ push_token: "aa".repeat(32) }, { push_token: dead }] };
    });
  }

  it("logs the summary before deleting registrations, with the profile and the outcome histogram", async () => {
    stubApple();
    const order: string[] = [];
    pushAdmin(order);
    const warn = vi.spyOn(console, "warn").mockImplementation((line) => void order.push(`warn:${String(line)}`));
    pushes.sendPassUpdatePushes.mockResolvedValue({
      sent: 1,
      failed: 1,
      invalidTokens: [dead],
      outcomes: { "200:ok": 1, "410:Unregistered": 1 },
    });

    await service.notifyWalletsOfUpdate(USER);

    expect(order[0]).toMatch(/^warn:/);
    expect(order[1]).toBe("delete");
    expect(order[0]).toContain(USER);
    expect(order[0]).toContain('"410:Unregistered":1');
    expect(warn).toHaveBeenCalledOnce();
  });

  it("logs at error level when nothing was delivered", async () => {
    stubApple();
    const order: string[] = [];
    pushAdmin(order);
    const error = vi.spyOn(console, "error").mockImplementation((line) => void order.push(`error:${String(line)}`));
    pushes.sendPassUpdatePushes.mockResolvedValue({ sent: 0, failed: 2, invalidTokens: [], outcomes: { "400:BadTopic": 2 } });

    await service.notifyWalletsOfUpdate(USER);

    expect(error).toHaveBeenCalledOnce();
    expect(order[0]).toContain("nothing was delivered");
    expect(order[0]).toContain('"400:BadTopic":2');
    // BadTopic is our problem, not the devices': nothing is pruned.
    expect(order).not.toContain("delete");
  });

  it("stays at info when every push went through", async () => {
    stubApple();
    installAdmin(() => ({ data: [{ push_token: "aa".repeat(32) }] }));
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    pushes.sendPassUpdatePushes.mockResolvedValue({ sent: 1, failed: 0, invalidTokens: [], outcomes: { "200:ok": 1 } });
    await service.notifyWalletsOfUpdate(USER);
    expect(info).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

// --- withdrawing the passes of a deleted account -------------------------------
describe("withdrawWalletPasses", () => {
  it("replaces the Google object with an EXPIRED stub", async () => {
    stubApple();
    stubGoogle();
    installAdmin(() => ({ data: profile() }));
    google.syncGoogleObject.mockResolvedValue("updated");
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(service.withdrawWalletPasses(USER)).resolves.toEqual({ google: "expired" });
    expect(google.syncGoogleObject).toHaveBeenCalledWith(
      expect.objectContaining({ issuerId: "3388000000012345678" }),
      expect.objectContaining({ profileId: USER, withdrawn: true, card: expect.objectContaining({ slug: "alex" }) }),
    );
  });

  it("reports passes nobody saved, a Google failure, a missing card and no configuration", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(service.withdrawWalletPasses(USER)).resolves.toEqual({ google: "off" });

    stubGoogle();
    installAdmin(() => ({ data: profile() }));
    google.syncGoogleObject.mockResolvedValue("not_saved");
    await expect(service.withdrawWalletPasses(USER)).resolves.toEqual({ google: "not_saved" });

    google.syncGoogleObject.mockResolvedValue("failed");
    await expect(service.withdrawWalletPasses(USER)).resolves.toEqual({ google: "failed" });
    expect(error).toHaveBeenCalledOnce();

    google.syncGoogleObject.mockRejectedValue(new Error("boom"));
    await expect(service.withdrawWalletPasses(USER)).resolves.toEqual({ google: "failed" });

    installAdmin(() => ({ data: null }));
    await expect(service.withdrawWalletPasses(USER)).resolves.toEqual({ google: "off" });
  });
});

// --- the web service: limits, database errors and what a pass contains ----------
describe("Apple web service guards", () => {
  it("answers 429 with Retry-After before touching our tables when an address is over its limit", async () => {
    stubApple();
    const admin = walletAdmin({ allow: () => false });
    const result = await webService.openWebService(new Request("https://passme.test/x", at()));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(429);
    expect(result.response.headers.get("retry-after")).toBe("17");
    expect(admin.queries.map((q) => q.table)).toEqual(["rpc:rate_limit_hit"]);
    expect(admin.rateCalls).toEqual([300]);
  });

  it("is closed (404) before it spends a limiter call when the web service is off", async () => {
    const admin = walletAdmin();
    const result = await webService.openWebService(new Request("https://passme.test/x", at()));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
    expect(admin.queries).toHaveLength(0);
  });

  it("limits full pass downloads per pass", async () => {
    const allowed = walletAdmin();
    expect(await webService.limitPassRefresh(USER)).toBeNull();
    expect(allowed.rateCalls).toEqual([60]);
    walletAdmin({ allow: () => false });
    const limited = await webService.limitPassRefresh(USER);
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("retry-after")).toBe("17");
  });

  it("answers 503, logs, and doesn't blame the token, when the token lookup hits a database error", async () => {
    stubApple();
    walletAdmin({ tableError: "wallet_pass_secrets" });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const context = webService.getWebServiceContext();
    if (!context.ok) throw new Error("expected context");
    const denied = await webService.authorizePass(context.ctx, new Request("https://x", at()), PASS_TYPE, USER);
    expect(denied?.status).toBe(503);
    expect(denied?.headers.get("retry-after")).toBe("30");
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]![0])).toContain(USER);
  });

  it("still answers 401 for a wrong token or an unknown pass", async () => {
    stubApple();
    walletAdmin();
    let context = webService.getWebServiceContext();
    if (!context.ok) throw new Error("expected context");
    expect((await webService.authorizePass(context.ctx, new Request("https://x", at(`ApplePass ${"u".repeat(64)}`)), PASS_TYPE, USER))?.status).toBe(401);
    walletAdmin({ token: null });
    context = webService.getWebServiceContext();
    if (!context.ok) throw new Error("expected context");
    expect((await webService.authorizePass(context.ctx, new Request("https://x", at()), PASS_TYPE, USER))?.status).toBe(401);
  });
});

describe("pass download route", () => {
  it("returns the pass with no-store, honours If-Modified-Since, and rate-limits only full downloads", async () => {
    stubApple();
    const admin = walletAdmin();
    const ok = await passRoute.GET(passRequest(), passParams());
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(ok.headers.get("content-type")).toBe("application/vnd.apple.pkpass");
    expect(admin.rateCalls).toEqual([300, 60]);

    const notModified = walletAdmin();
    const response = await passRoute.GET(passRequest({ "if-modified-since": new Date("2026-09-03T00:00:00Z").toUTCString() }), passParams());
    expect(response.status).toBe(304);
    expect(notModified.rateCalls).toEqual([300]);
  }, 30_000);

  it("answers 429 when a pass is asked for too often", async () => {
    stubApple();
    // The address is fine; this one pass has been downloaded too many times.
    walletAdmin({ allow: (limit) => limit === 300 });
    const limited = await passRoute.GET(passRequest(), passParams());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("17");
  }, 30_000);

  it("rejects bad requests without building anything", async () => {
    stubApple();
    walletAdmin();
    expect((await passRoute.GET(passRequest({}, `ApplePass ${"u".repeat(64)}`), passParams())).status).toBe(401);
    expect((await passRoute.GET(passRequest(), passParams("pass.other"))).status).toBe(404);
    walletAdmin({ allow: () => false });
    expect((await passRoute.GET(passRequest(), passParams())).status).toBe(429);
  });

  it("answers 503 (Wallet retries) when the token lookup fails", async () => {
    stubApple();
    walletAdmin({ tableError: "wallet_pass_secrets" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await passRoute.GET(passRequest(), passParams())).status).toBe(503);
  });

  it("answers 503 instead of a photo-less pass when the photo is only temporarily unreachable", async () => {
    stubApple();
    stubSupabasePublic();
    walletAdmin({ profile: profile({ avatar_path: `${USER}/avatar-1.jpg` }) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await passRoute.GET(passRequest(), passParams());
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
  }, 30_000);

  it("builds the pass without the photo when it is gone for good (404)", async () => {
    stubApple();
    stubSupabasePublic();
    walletAdmin({ profile: profile({ avatar_path: `${USER}/avatar-1.jpg` }) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await passRoute.GET(passRequest(), passParams())).status).toBe(200);
  }, 30_000);

  it("serves the paused stub for an unpublished card, and the full pass again once republished", async () => {
    stubApple();
    walletAdmin({ profile: profile({ is_published: false }) });
    const paused = await passJson(await passRoute.GET(passRequest(), passParams()));
    expect(paused.storeCard.backFields).toEqual([]);
    expect(paused.storeCard.secondaryFields).toEqual([]);
    expect(paused.storeCard.auxiliaryFields).toEqual([{ key: "status", label: "ESTADO", value: "Tarjeta en pausa" }]);
    // The web service keeps working, so the republished pass reaches the phone.
    expect(paused.authenticationToken).toBe(TOKEN);
    expect(JSON.stringify(paused)).not.toContain("alex@example.com");

    walletAdmin({ profile: profile({ is_published: true }) });
    const live = await passJson(await passRoute.GET(passRequest(), passParams()));
    expect(JSON.stringify(live.storeCard.backFields)).toContain("alex@example.com");
    expect(live.storeCard.auxiliaryFields).toEqual([]);
  }, 60_000);
});

describe("device registration routes", () => {
  const register = (body: unknown) =>
    new Request(`https://passme.test/api/wallet/v1/devices/dev1/registrations/${PASS_TYPE}/${USER}`, {
      method: "POST",
      body: JSON.stringify(body),
      ...at(),
    }) as never;
  const registrationParams = { params: Promise.resolve({ deviceLibraryId: "dev1", passTypeId: PASS_TYPE, serialNumber: USER }) } as never;

  it("is behind the per-address limit before any lookup", async () => {
    stubApple();
    const admin = walletAdmin({ allow: () => false });
    const response = await registrationRoute.POST(register({ pushToken: "ab".repeat(32) }), registrationParams);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(admin.queries.map((q) => q.table)).toEqual(["rpc:rate_limit_hit"]);
  });

  it("registers a device and reports a database failure as a retryable 503", async () => {
    stubApple();
    walletAdmin();
    expect((await registrationRoute.POST(register({ pushToken: "ab".repeat(32) }), registrationParams)).status).toBe(201);
    walletAdmin({ tableError: "apple_pass_registrations" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = await registrationRoute.POST(register({ pushToken: "ab".repeat(32) }), registrationParams);
    expect(failed.status).toBe(503);
    expect(failed.headers.get("retry-after")).toBe("30");
  });

  it("limits the serial list per address too", async () => {
    stubApple();
    const request = new NextRequest(`https://passme.test/api/wallet/v1/devices/dev1/registrations/${PASS_TYPE}`, at());
    const params = { params: Promise.resolve({ deviceLibraryId: "dev1", passTypeId: PASS_TYPE }) } as never;
    walletAdmin({ allow: () => false });
    expect((await serialsRoute.GET(request, params)).status).toBe(429);
    walletAdmin();
    expect((await serialsRoute.GET(request, params)).status).toBe(204);
  });
});

// --- building passes through the service ---------------------------------------
describe("pass generation service", () => {
  it("refuses to build a photo-less pass during a storage outage, with a Spanish message", async () => {
    stubApple();
    stubSupabasePublic();
    walletAdmin({ profile: profile({ avatar_path: `${USER}/avatar-1.jpg` }) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 502 })));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(service.buildApplePassForProfile(USER)).rejects.toMatchObject({
      status: 503,
      code: "unavailable",
      message: expect.stringContaining("foto"),
    });
  }, 30_000);

  it("includes the photo when storage answers", async () => {
    stubApple();
    stubSupabasePublic();
    walletAdmin({ profile: profile({ avatar_path: `${USER}/avatar-1.jpg` }) });
    const photo = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#EF7A4A" } }).jpeg().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(photo), { status: 200 })));
    const pass = await service.buildApplePassForProfile(USER);
    expect(pass.slug).toBe("alex");
  }, 30_000);

  it("warns in production when the web service is off, and only then", async () => {
    stubApple();
    vi.stubEnv("APPLE_WALLET_WEB_SERVICE", "false");
    walletAdmin();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await service.buildApplePassForProfile(USER);
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv("VERCEL_ENV", "production");
    await service.buildApplePassForProfile(USER);
    expect(warn).toHaveBeenCalledOnce();
    const line = String(warn.mock.calls[0]![0]);
    expect(line).toContain("never refresh");
    expect(line).toContain("APPLE_WALLET_WEB_SERVICE=false");
    expect(line).toContain(USER);
  }, 60_000);

  it("stays quiet in production when the web service is on", async () => {
    stubApple();
    vi.stubEnv("VERCEL_ENV", "production");
    walletAdmin();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await service.buildApplePassForProfile(USER);
    expect(warn).not.toHaveBeenCalled();
  }, 30_000);
});

describe("pass download errors", () => {
  const asScript = () => new Request("https://passme.test/api/pass/apple", { headers: { accept: "application/json" } });

  it("logs a missing credential at error level, since people only see a vague notice", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = passErrorResponse(asScript(), new service.PassError(503, "not_configured", "Apple Wallet no está configurado todavía."), "apple");
    expect(response.status).toBe(503);
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]![0])).toContain("not configured");
  });

  it("doesn't log the ordinary refusals, and treats an unreachable photo as a retryable 503", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(passErrorResponse(asScript(), new service.PassError(401, "unauthorized", "Entra."), "apple").status).toBe(401);
    expect(passErrorResponse(asScript(), new service.PassError(404, "not_found", "No."), "apple").status).toBe(404);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    const unavailable = passErrorResponse(asScript(), new service.PassError(503, "unavailable", "Inténtalo de nuevo."), "apple");
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ error: "unavailable" });
    expect(warn).toHaveBeenCalledOnce();
  });
});
