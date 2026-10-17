import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toPublicCard } from "@/lib/data/cards";
import { DEMO_CARD } from "@/lib/card/demo";
import type { PublicCardLookup } from "@/lib/data/cards";

const card = { ...toPublicCard(DEMO_CARD), slug: "alex", avatarUrl: null };

const state: {
  lookup: PublicCardLookup;
  redirect: string | null;
  allowed: boolean;
  avatar: Buffer | null;
  seenKeys: string[];
} = { lookup: { status: "found", card }, redirect: null, allowed: true, avatar: null, seenKeys: [] };

vi.mock("@/lib/data/cards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/cards")>()),
  lookupPublicCard: async () => state.lookup,
  resolveSlugRedirect: async () => state.redirect,
}));
vi.mock("@/lib/data/rate-limits", () => ({
  createSharedRateLimiter: ({ name }: { name: string }) => ({
    check: async (key: string) => {
      state.seenKeys.push(`${name}:${key}`);
      return { ok: state.allowed, remaining: 0, retryAfterSeconds: state.allowed ? 0 : 23, degraded: false };
    },
  }),
}));
vi.mock("@/lib/data/events", () => ({ recordEventBySlug: async () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vercel-forwarded-for": "203.0.113.9" }) }));
vi.mock("@/lib/pass/images", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pass/images")>()),
  fetchAvatar: async () => state.avatar,
}));
vi.mock("@/lib/pass/art", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pass/art")>()),
  heroImage: async () => Buffer.from("png-bytes"),
}));

const hero = await import("@/app/u/[slug]/hero/route");
const qr = await import("@/app/u/[slug]/qr/route");
const vcard = await import("@/app/u/[slug]/vcard/route");
const og = (await import("@/app/u/[slug]/opengraph-image")).default;
const { artVersion } = await vi.importActual<typeof import("@/lib/pass/art")>("@/lib/pass/art");

const ctx = { params: Promise.resolve({ slug: "alex" }) } as never;
const get = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://passme.test${path}`, { headers: { "x-vercel-forwarded-for": "203.0.113.9", "user-agent": "Googlebot", ...headers } });

beforeEach(() => {
  state.lookup = { status: "found", card };
  state.redirect = null;
  state.allowed = true;
  state.avatar = null;
  state.seenKeys = [];
});
afterEach(() => vi.restoreAllMocks());

/** Every public card route must answer a database failure the same way, and never as "not found". */
function expectUnavailable(response: Response) {
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("30");
  expect(response.headers.get("cache-control")).toBe("no-store");
}

describe("hero image route", () => {
  it("answers 503 + Retry-After + no-store when the database fails, and 404 only for a real miss", async () => {
    state.lookup = { status: "error" };
    expectUnavailable(await hero.GET(get("/u/alex/hero"), ctx));
    state.lookup = { status: "missing" };
    const missing = await hero.GET(get("/u/alex/hero"), ctx);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });

  it("rate-limits per address before looking anything up", async () => {
    state.allowed = false;
    state.lookup = { status: "error" };
    const response = await hero.GET(get("/u/alex/hero"), ctx);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("23");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.seenKeys).toEqual(["hero-ip:203.0.113.9"]);
  });

  it("only grants the year-long cache to the exact current version", async () => {
    const current = artVersion(card, "hero");
    const ok = await hero.GET(get(`/u/alex/hero?v=${current}`), ctx);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    for (const wrong of ["", "?v=abc", `?v=${current.slice(0, 8)}`, `?v=${current}0`, "?v=00000000"]) {
      const stale = await hero.GET(get(`/u/alex/hero${wrong}`), ctx);
      expect(stale.headers.get("cache-control"), wrong).toBe("public, max-age=300");
    }
  });
});

describe("QR route", () => {
  it("answers 503 on a database failure, 404 on a miss, and the SVG otherwise", async () => {
    state.lookup = { status: "error" };
    expectUnavailable(await qr.GET(get("/u/alex/qr"), ctx));
    state.lookup = { status: "missing" };
    expect((await qr.GET(get("/u/alex/qr"), ctx)).status).toBe(404);
    state.lookup = { status: "found", card };
    const svg = await qr.GET(get("/u/alex/qr"), ctx);
    expect(svg.status).toBe(200);
    expect(svg.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("limits the PNG variant only", async () => {
    state.allowed = false;
    const png = await qr.GET(get("/u/alex/qr?format=png"), ctx);
    expect(png.status).toBe(429);
    expect(png.headers.get("retry-after")).toBe("23");
    expect((await qr.GET(get("/u/alex/qr"), ctx)).status).toBe(200);
  });
});

describe("vCard route", () => {
  it("answers 503 on a database failure instead of looking for a renamed handle", async () => {
    state.lookup = { status: "error" };
    state.redirect = "alex-new";
    expectUnavailable(await vcard.GET(get("/u/alex/vcard"), ctx));
  });

  it("answers 404 for a miss, and follows a renamed handle", async () => {
    state.lookup = { status: "missing" };
    const missing = await vcard.GET(get("/u/alex/vcard"), ctx);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    state.redirect = "alex-new";
    const moved = await vcard.GET(get("/u/alex/vcard?src=qr"), ctx);
    expect(moved.status).toBe(307);
    expect(moved.headers.get("location")).toBe("https://passme.test/u/alex-new/vcard?src=qr");
  });

  it("serves the vCard for a found card", async () => {
    const ok = await vcard.GET(get("/u/alex/vcard"), ctx);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("BEGIN:VCARD");
  });
});

describe("link preview (opengraph-image) route", () => {
  const ogParams = { params: Promise.resolve({ slug: "alex" }) };

  it("rate-limits per address before any lookup, with the same limiter key as the other image routes", async () => {
    state.allowed = false;
    state.lookup = { status: "error" };
    const response = await og(ogParams);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("23");
    expect(state.seenKeys).toEqual(["og-ip:203.0.113.9"]);
  });

  it("answers 503 when the database fails: no generic image for crawlers to remember", async () => {
    state.lookup = { status: "error" };
    expectUnavailable(await og(ogParams));
  });

  it("serves the generic image with a 404 and no-store for a card that doesn't exist or isn't published", async () => {
    state.lookup = { status: "missing" };
    const response = await og(ogParams);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100);
  }, 30_000);

  it("caches a card's preview for an hour at the edge, not for a year", async () => {
    const response = await og(ogParams);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
    expect(response.headers.get("cache-control")).not.toMatch(/immutable|31536000/);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  }, 30_000);

  it("still renders the preview when the photo downloads but can't be converted", async () => {
    state.avatar = Buffer.from("this is not an image");
    state.lookup = { status: "found", card: { ...card, avatarUrl: "https://x.supabase.co/storage/v1/object/public/avatars/u/a.jpg" } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await og(ogParams);
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect(warn.mock.calls.map((call) => String(call[0])).join("\n")).toContain("link preview photo conversion failed");
  }, 30_000);
});
