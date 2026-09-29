import JSZip from "jszip";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileRow } from "@/lib/supabase/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { fakeSupabase, first, type Handler } from "./helpers/fake-supabase";
import { createTestCerts, type TestCerts } from "./helpers/test-certs";

const USER = "11111111-1111-4111-8111-111111111111";

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

const { recordEventBySlug, recordEventForProfile } = await import("@/lib/data/events");
const service = await import("@/lib/pass/service");
const { signHandoffToken } = await import("@/lib/pass/handoff");
const { authorizePass, getWebServiceContext } = await import("@/lib/pass/web-service");
const { sendPassUpdatePushes: realSendPushes } = await vi.importActual<typeof import("@/lib/pass/apns")>("@/lib/pass/apns");

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: USER,
    slug: "alex",
    full_name: "Alex Rivera",
    headline: "Designer",
    company: "Norte",
    location: "",
    pronouns: "",
    bio: "",
    accent_color: "#2340F5",
    detail_color: null,
    pattern: "orbitas",
    pattern_seed: 42,
    typeface: "clasica",
    avatar_path: null,
    links: [{ id: "l-email-1", kind: "email", value: "alex@example.com", visible: true }],
    is_published: true,
    accepts_contact_requests: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    ...overrides,
  };
}

function useAdmin(handler: Handler) {
  const fake = fakeSupabase(handler);
  state.admin = fake.client;
  return fake;
}

let certs: TestCerts;
beforeAll(() => {
  certs = createTestCerts();
}, 60_000);

function stubApple({ https = true } = {}) {
  vi.stubEnv("APPLE_PASS_TYPE_ID", "pass.app.passme.test");
  vi.stubEnv("APPLE_TEAM_ID", "TEAMID1234");
  vi.stubEnv("APPLE_PASS_CERT", Buffer.from(certs.signerCert).toString("base64"));
  vi.stubEnv("APPLE_PASS_KEY", Buffer.from(certs.signerKey).toString("base64"));
  vi.stubEnv("APPLE_WWDR_CERT", Buffer.from(certs.wwdr).toString("base64"));
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", https ? "https://passme.test" : "http://localhost:3000");
}

beforeEach(() => {
  state.admin = null;
  state.sessionUserId = null;
  pushes.sendPassUpdatePushes.mockReset();
  google.syncGoogleObject.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("events", () => {
  it("does nothing without an admin client or for the demo card", async () => {
    await recordEventBySlug("alex", { kind: "view" });
    const fake = useAdmin(() => ({}));
    await recordEventBySlug("demo", { kind: "view" });
    expect(fake.queries).toHaveLength(0);
  });

  it("records visitor events in one validated database call", async () => {
    const fake = useAdmin(() => ({ data: true }));
    await recordEventBySlug("alex", { kind: "link_click", source: "qr", linkId: "l-email-1" });
    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]!.table).toBe("rpc:record_card_event");
    expect(fake.queries[0]!.calls[0]![1][0]).toEqual({ p_slug: "alex", p_kind: "link_click", p_source: "qr", p_link_id: "l-email-1" });
  });

  it("falls back to lookup + insert while the migration is pending", async () => {
    const fake = useAdmin((q) => {
      if (q.table === "rpc:record_card_event") return { error: { message: "missing", code: "PGRST202" } };
      return first(q) === "select" ? { data: { id: USER } } : {};
    });
    await recordEventBySlug("alex", { kind: "link_click", source: "qr", linkId: "l-email-1" });
    const insert = fake.queries.find((q) => first(q) === "insert")!;
    expect(insert.calls[0]![1][0]).toEqual({ profile_id: USER, kind: "link_click", source: "qr", link_id: "l-email-1" });
  });

  it("skips the insert when the card is unknown or the lookup fails", async () => {
    const unknown = useAdmin((q) => (q.table.startsWith("rpc:") ? { error: { message: "missing", code: "PGRST202" } } : { data: null }));
    await recordEventBySlug("ghost", { kind: "view" });
    expect(unknown.queries.some((q) => first(q) === "insert")).toBe(false);
    const failing = useAdmin(() => ({ error: { message: "down" } }));
    await recordEventForProfile(USER, { kind: "vcard" });
    expect(failing.queries).toHaveLength(1);
  });
});

describe("pass owner resolution", () => {
  it("accepts a valid handoff token", async () => {
    vi.stubEnv("PASSME_SIGNING_SECRET", "s".repeat(40));
    const token = await signHandoffToken(USER);
    await expect(service.resolvePassOwnerId(token)).resolves.toBe(USER);
  });

  it("falls back to the session and rejects anonymous callers", async () => {
    state.sessionUserId = USER;
    await expect(service.resolvePassOwnerId(null)).resolves.toBe(USER);
    state.sessionUserId = null;
    await expect(service.resolvePassOwnerId("forged")).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });
});

describe("pass generation service", () => {
  it("reports missing configuration", async () => {
    await expect(service.buildApplePassForProfile(USER)).rejects.toMatchObject({ status: 503 });
    await expect(service.buildDemoApplePass()).rejects.toMatchObject({ code: "not_configured" });
    await expect(service.buildGoogleSaveUrlForProfile(USER)).rejects.toMatchObject({ status: 503 });
    await expect(service.buildDemoGoogleSaveUrl()).rejects.toMatchObject({ status: 503 });
  });

  it("refuses unknown or nameless cards", async () => {
    stubApple();
    useAdmin(() => ({ data: null }));
    await expect(service.buildApplePassForProfile(USER)).rejects.toMatchObject({ status: 404 });
    useAdmin(() => ({ data: profile({ full_name: "" }) }));
    await expect(service.buildApplePassForProfile(USER)).rejects.toMatchObject({ status: 409 });
  });

  it("builds a signed pass with a web-service token for the owner", async () => {
    stubApple();
    useAdmin((q) => (q.table === "profiles" ? { data: profile() } : { data: { apple_auth_token: "t".repeat(64) } }));
    const pass = await service.buildApplePassForProfile(USER);
    const zip = await JSZip.loadAsync(pass.buffer);
    const json = JSON.parse(await zip.file("pass.json")!.async("string"));
    expect(pass.slug).toBe("alex");
    expect(json).toMatchObject({
      serialNumber: USER,
      authenticationToken: "t".repeat(64),
      webServiceURL: "https://passme.test/api/wallet",
      backgroundColor: "rgb(35, 64, 245)",
    });
  }, 30_000);

  it("builds the demo pass without a web service", async () => {
    stubApple();
    const pass = await service.buildDemoApplePass();
    const json = JSON.parse(await (await JSZip.loadAsync(pass.buffer)).file("pass.json")!.async("string"));
    expect(json.webServiceURL).toBeUndefined();
    expect(json.description).toBe("Tarjeta de contacto de Alex Rivera");
    expect(json.storeCard.secondaryFields[0].value).toBe("Product Designer");
  }, 30_000);
});

describe("notifyWalletsOfUpdate", () => {
  it("pushes to registered devices and prunes invalid tokens", async () => {
    stubApple();
    const deletes: unknown[] = [];
    useAdmin((q) => {
      if (first(q) === "delete") {
        deletes.push(q.calls);
        return {};
      }
      return { data: [{ push_token: "aa".repeat(32) }, { push_token: "bb".repeat(32) }] };
    });
    pushes.sendPassUpdatePushes.mockResolvedValue({ sent: 1, failed: 1, invalidTokens: ["bb".repeat(32)] });

    await service.notifyWalletsOfUpdate(USER);

    expect(pushes.sendPassUpdatePushes).toHaveBeenCalledWith(expect.objectContaining({ passTypeId: "pass.app.passme.test" }), [
      "aa".repeat(32),
      "bb".repeat(32),
    ]);
    expect(JSON.stringify(deletes)).toContain("bb".repeat(32));
  });

  it("syncs Google Wallet when configured and never throws", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "3388000000012345678");
    vi.stubEnv(
      "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON",
      JSON.stringify({ client_email: "sa@x.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }),
    );
    useAdmin(() => ({ data: profile() }));
    google.syncGoogleObject.mockRejectedValue(new Error("network"));
    await expect(service.notifyWalletsOfUpdate(USER)).resolves.toBeUndefined();
    expect(google.syncGoogleObject).toHaveBeenCalledOnce();
  });

  it("is a no-op without the admin client", async () => {
    stubApple();
    await service.notifyWalletsOfUpdate(USER);
    expect(pushes.sendPassUpdatePushes).not.toHaveBeenCalled();
  });
});

describe("Apple web service plumbing", () => {
  it("is closed unless Apple + https + admin are all configured", () => {
    expect(getWebServiceContext().ok).toBe(false);
    stubApple({ https: false });
    useAdmin(() => ({}));
    expect(getWebServiceContext().ok).toBe(false);
    stubApple();
    expect(getWebServiceContext().ok).toBe(true);
  });

  it("authorizes by pass type, serial shape and ApplePass token", async () => {
    stubApple();
    useAdmin(() => ({ data: { apple_auth_token: "t".repeat(64) } }));
    const context = getWebServiceContext();
    if (!context.ok) throw new Error("expected context");
    const request = (auth?: string) => new Request("https://x", { headers: auth ? { authorization: auth } : {} });

    expect((await authorizePass(context.ctx, request(`ApplePass ${"t".repeat(64)}`), "pass.other", USER))?.status).toBe(404);
    expect((await authorizePass(context.ctx, request(`ApplePass ${"t".repeat(64)}`), "pass.app.passme.test", "x"))?.status).toBe(404);
    expect((await authorizePass(context.ctx, request(`ApplePass ${"u".repeat(64)}`), "pass.app.passme.test", USER))?.status).toBe(401);
    expect(await authorizePass(context.ctx, request(`ApplePass ${"t".repeat(64)}`), "pass.app.passme.test", USER)).toBeNull();
  });
});

describe("APNs client", () => {
  it("skips malformed tokens without opening a connection", async () => {
    stubApple();
    const { getAppleWalletConfig } = await import("@/lib/config.server");
    const summary = await realSendPushes(getAppleWalletConfig()!, ["not-hex", ""]);
    expect(summary).toEqual({ sent: 0, failed: 0, invalidTokens: [] });
  });

  it("counts every push as failed when APNs is unreachable", async () => {
    stubApple();
    vi.stubEnv("APPLE_APNS_HOST", "https://127.0.0.1:9");
    const { getAppleWalletConfig } = await import("@/lib/config.server");
    const summary = await realSendPushes(getAppleWalletConfig()!, ["ab".repeat(32), "cd".repeat(32)]);
    expect(summary.sent).toBe(0);
    expect(summary.failed).toBe(2);
    expect(summary.invalidTokens).toEqual([]);
  }, 20_000);
});
