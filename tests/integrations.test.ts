import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { fakeSupabase, first, type Handler } from "./helpers/fake-supabase";

const state: { admin: TypedSupabaseClient | null } = { admin: null };
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => state.admin }));

const otp = await import("@/lib/data/otp-attempts");
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
  it("locks when the shared counter reaches the limit", async () => {
    useAdmin(() => ({ count: otp.OTP_MAX_FAILURES }));
    expect(await otp.isOtpLocked("shared@example.com")).toBe(true);
    useAdmin(() => ({ count: otp.OTP_MAX_FAILURES - 1 }));
    expect(await otp.isOtpLocked("shared@example.com")).toBe(false);
  });

  it("fails closed if the counter cannot be read", async () => {
    useAdmin(() => ({ error: { message: "db down" } }));
    expect(await otp.isOtpLocked("anyone@example.com")).toBe(true);
  });

  it("stores only a hash on failure and clears on success", async () => {
    const fake = useAdmin(() => ({}));
    vi.spyOn(Math, "random").mockReturnValue(0.01); // also exercise the opportunistic cleanup
    await otp.recordOtpFailure("Hash.Me@example.com");
    const insert = fake.queries.find((q) => first(q) === "insert")!;
    expect(insert.calls[0]![1][0]).toEqual({ email_hash: otp.hashEmail("hash.me@example.com") });
    expect(JSON.stringify(fake.queries)).not.toContain("example.com");
    expect(fake.queries.some((q) => first(q) === "delete")).toBe(true);

    await otp.clearOtpFailures("hash.me@example.com");
    const clear = fake.queries.at(-1)!;
    expect(first(clear)).toBe("delete");
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
