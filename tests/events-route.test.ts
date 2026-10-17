import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * /api/events: a beacon that never errors loudly, with a ceiling per card so
 * many addresses together can't flood one card's stats table.
 */

const state = vi.hoisted(() => ({
  recorded: [] as Array<{ slug: string; kind: string }>,
}));

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (task: () => unknown) => void task(),
}));
vi.mock("@/lib/data/events", () => ({
  recordEventBySlug: async (slug: string, event: { kind: string }) => {
    state.recorded.push({ slug, kind: event.kind });
  },
}));

const { POST } = await import("@/app/api/events/route");

const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";

function beacon(body: unknown, ip: string, userAgent = BROWSER): NextRequest {
  return new NextRequest("https://getpassme.com/api/events", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "user-agent": userAgent, "x-forwarded-for": ip },
  });
}

let counter = 0;
const freshIp = () => {
  counter += 1;
  return `10.${(counter >> 16) & 255}.${(counter >> 8) & 255}.${counter & 255}`;
};

beforeEach(() => {
  state.recorded = [];
});

describe("POST /api/events", () => {
  it("records a view", async () => {
    const response = await POST(beacon({ slug: "ana-gil", kind: "view" }, freshIp()));
    expect(response.status).toBe(204);
    expect(state.recorded).toEqual([{ slug: "ana-gil", kind: "view" }]);
  });

  it("ignores bots, and rejects malformed beacons", async () => {
    expect((await POST(beacon({ slug: "ana-gil", kind: "view" }, freshIp(), "Googlebot/2.1"))).status).toBe(204);
    expect(state.recorded).toEqual([]);
    expect((await POST(beacon("{oops", freshIp()))).status).toBe(400);
    expect((await POST(beacon({ slug: "Bad Slug", kind: "view" }, freshIp()))).status).toBe(400);
    expect((await POST(beacon({ slug: "ana-gil", kind: "delete" }, freshIp()))).status).toBe(400);
  });

  it("stops recording past 5000 events an hour for one card, silently (204), whoever sends them", async () => {
    for (let i = 0; i < 5000; i += 1) {
      expect((await POST(beacon({ slug: "flooded-card", kind: "view" }, freshIp()))).status).toBe(204);
    }
    expect(state.recorded).toHaveLength(5000);

    const over = await POST(beacon({ slug: "flooded-card", kind: "view" }, freshIp()));
    expect(over.status).toBe(204);
    expect(state.recorded).toHaveLength(5000);

    // Other cards are not affected.
    expect((await POST(beacon({ slug: "calm-card", kind: "view" }, freshIp()))).status).toBe(204);
    expect(state.recorded.at(-1)).toEqual({ slug: "calm-card", kind: "view" });
  }, 60_000);

  it("does not spend a card's budget on invalid beacons", async () => {
    for (let i = 0; i < 20; i += 1) await POST(beacon({ slug: "careful-card", kind: "nope" }, freshIp()));
    await POST(beacon({ slug: "careful-card", kind: "view" }, freshIp()));
    expect(state.recorded).toEqual([{ slug: "careful-card", kind: "view" }]);
  });

  it("still limits each address to 60 a minute (429, as before)", async () => {
    const ip = freshIp();
    for (let i = 0; i < 60; i += 1) expect((await POST(beacon({ slug: "ana-gil", kind: "view" }, ip))).status).toBe(204);
    expect((await POST(beacon({ slug: "ana-gil", kind: "view" }, ip))).status).toBe(429);
  });
});
