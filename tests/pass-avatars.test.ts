import { generateKeyPairSync } from "node:crypto";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_CARD } from "@/lib/card/demo";
import type { GoogleWalletConfig } from "@/lib/config.server";
import { toPublicCard } from "@/lib/data/cards";
import { resetGoogleAccessTokenCache, syncGoogleObject } from "@/lib/pass/google";
import { checkUploadedAvatar, fetchAvatar, fetchAvatarResult } from "@/lib/pass/images";

const card = toPublicCard(DEMO_CARD);
const URL_OK = "https://x.supabase.co/storage/v1/object/public/avatars/u/a.png";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetGoogleAccessTokenCache();
});

const png = (size: number) => sharp({ create: { width: size, height: size, channels: 3, background: "#EF7A4A" } }).png().toBuffer();
const respond = (build: () => Response | Promise<Response>) => vi.stubGlobal("fetch", vi.fn(async () => build()));
const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);

describe("avatar downloads: permanent vs transient failures", () => {
  it("says there is no photo when the card has none", async () => {
    expect(await fetchAvatarResult(null)).toEqual({ status: "none" });
  });

  it("returns the buffer and its size for a good photo", async () => {
    const body = await png(300);
    respond(() => new Response(new Uint8Array(body), { status: 200 }));
    expect(await fetchAvatarResult(URL_OK)).toMatchObject({ status: "ok", width: 300, height: 300, format: "png" });
  });

  it("treats timeouts, network errors, 5xx and 429 as transient", async () => {
    quiet();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await fetchAvatarResult(URL_OK)).toMatchObject({ status: "transient" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }));
    expect(await fetchAvatarResult(URL_OK)).toMatchObject({ status: "transient" });
    for (const status of [500, 502, 503, 429, 408]) {
      respond(() => new Response("nope", { status }));
      expect(await fetchAvatarResult(URL_OK), String(status)).toMatchObject({ status: "transient" });
    }
  });

  it("treats a body that dies halfway as transient", async () => {
    quiet();
    const broken = new ReadableStream({ start: (controller) => controller.error(new TypeError("terminated")) });
    respond(() => new Response(broken, { status: 200 }));
    expect(await fetchAvatarResult(URL_OK)).toMatchObject({ status: "transient" });
  });

  it("treats a missing file, junk, an SVG and oversized images as permanent", async () => {
    quiet();
    respond(() => new Response("gone", { status: 404 }));
    expect(await fetchAvatarResult(URL_OK)).toEqual({ status: "invalid", reason: "missing" });
    respond(() => new Response("not an image", { status: 200 }));
    expect(await fetchAvatarResult(URL_OK)).toEqual({ status: "invalid", reason: "undecodable" });
    respond(() => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>', { status: 200 }));
    expect(await fetchAvatarResult(URL_OK)).toMatchObject({ status: "invalid" });
    // 2000² is 4 MP: over the 1536² pixel cap.
    const big = await png(2000);
    respond(() => new Response(new Uint8Array(big), { status: 200 }));
    expect(await fetchAvatarResult(URL_OK)).toEqual({ status: "invalid", reason: "too_large" });
    respond(() => new Response("x", { status: 200, headers: { "content-length": String(3 * 1024 * 1024) } }));
    expect(await fetchAvatarResult(URL_OK)).toEqual({ status: "invalid", reason: "too_large" });
  });

  it("still accepts older photos up to the 1536 px pixel cap", async () => {
    const body = await png(1400);
    respond(() => new Response(new Uint8Array(body), { status: 200 }));
    expect((await fetchAvatarResult(URL_OK)).status).toBe("ok");
  });

  it("keeps fetchAvatar's null-on-any-failure contract and logs who it was for", async () => {
    const warn = quiet();
    respond(() => new Response("down", { status: 503 }));
    expect(await fetchAvatar(URL_OK, { slug: "alex", profileId: "p-1" })).toBeNull();
    const logged = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain('"slug":"alex"');
    expect(logged).toContain('"profileId":"p-1"');
    expect(logged).toContain('"transient":true');
  });
});

describe("photos being saved to a card", () => {
  it("accepts a 512 px photo and one exactly 1024 px on its longest side", async () => {
    for (const size of [512, 1024]) {
      const body = await png(size);
      respond(() => new Response(new Uint8Array(body), { status: 200 }));
      expect(await checkUploadedAvatar(URL_OK), String(size)).toEqual({ verdict: "ok" });
    }
  });

  it("rejects a photo over 1024 px with an error the editor can show", async () => {
    const body = await png(1200);
    respond(() => new Response(new Uint8Array(body), { status: 200 }));
    expect(await checkUploadedAvatar(URL_OK)).toEqual({ verdict: "rejected", error: "La foto es demasiado grande. Elige otra." });
    const wide = await sharp({ create: { width: 1100, height: 100, channels: 3, background: "#000" } }).jpeg().toBuffer();
    respond(() => new Response(new Uint8Array(wide), { status: 200 }));
    expect(await checkUploadedAvatar(URL_OK)).toMatchObject({ verdict: "rejected" });
  });

  it("rejects files that are not JPEG/PNG/WebP photos", async () => {
    quiet();
    respond(() => new Response("<svg/>", { status: 200 }));
    expect(await checkUploadedAvatar(URL_OK)).toMatchObject({ verdict: "rejected" });
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).gif().toBuffer();
    respond(() => new Response(new Uint8Array(gif), { status: 200 }));
    expect(await checkUploadedAvatar(URL_OK)).toMatchObject({ verdict: "rejected" });
  });

  it("doesn't block the save when the photo can't be checked right now", async () => {
    quiet();
    respond(() => new Response("down", { status: 503 }));
    expect(await checkUploadedAvatar(URL_OK)).toEqual({ verdict: "unverified" });
    respond(() => new Response("gone", { status: 404 }));
    expect(await checkUploadedAvatar(URL_OK)).toEqual({ verdict: "unverified" });
    expect(await checkUploadedAvatar(null)).toEqual({ verdict: "ok" });
  });
});

describe("Google OAuth token reuse", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const googleConfig: GoogleWalletConfig = {
    issuerId: "3388000000012345678",
    serviceAccountEmail: "wallet@passme-test.iam.gserviceaccount.com",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    classSuffix: "passme_card_v1",
  };

  function stubGoogle(apiStatus: () => number, expiresIn = 3600) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).includes("oauth2.googleapis.com")) return Response.json({ access_token: `token-${calls.length}`, expires_in: expiresIn });
        return new Response("{}", { status: apiStatus() });
      }),
    );
    return calls;
  }
  const tokenCalls = (calls: string[]) => calls.filter((url) => url.includes("oauth2.googleapis.com")).length;

  it("exchanges the service-account assertion once for several syncs", async () => {
    const calls = stubGoogle(() => 200);
    for (let i = 0; i < 3; i += 1) {
      expect(await syncGoogleObject(googleConfig, { card, profileId: DEMO_CARD.id })).toBe("updated");
    }
    expect(tokenCalls(calls)).toBe(1);
    expect(calls.filter((url) => url.includes("walletobjects"))).toHaveLength(3);
  });

  it("asks for a new token after Google rejects the cached one", async () => {
    quiet();
    let status = 200;
    const calls = stubGoogle(() => status);
    await syncGoogleObject(googleConfig, { card, profileId: DEMO_CARD.id });
    status = 401;
    expect(await syncGoogleObject(googleConfig, { card, profileId: DEMO_CARD.id })).toBe("failed");
    status = 200;
    expect(await syncGoogleObject(googleConfig, { card, profileId: DEMO_CARD.id })).toBe("updated");
    expect(tokenCalls(calls)).toBe(2);
  });

  it("doesn't keep a token that is about to expire", async () => {
    const calls = stubGoogle(() => 200, 30);
    await syncGoogleObject(googleConfig, { card, profileId: DEMO_CARD.id });
    await syncGoogleObject(googleConfig, { card, profileId: DEMO_CARD.id });
    expect(tokenCalls(calls)).toBe(2);
  });

  it("sends the stub of a paused card, not its details", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("oauth2")) return Response.json({ access_token: "t", expires_in: 3600 });
        bodies.push(String(init?.body));
        return new Response("{}", { status: 200 });
      }),
    );
    await syncGoogleObject(googleConfig, { card, profileId: DEMO_CARD.id, paused: true });
    const sent = JSON.parse(bodies[0]!);
    expect(sent.state).toBe("INACTIVE");
    expect(sent).not.toHaveProperty("linksModuleData");
    expect(bodies[0]).not.toContain("alex@example.com");
  });
});
