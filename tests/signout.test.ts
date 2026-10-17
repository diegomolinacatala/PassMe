import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => state.supabase }));

const { POST } = await import("@/app/auth/signout/route");

function post(fields: Record<string, string> = {}, headers: Record<string, string> = {}): NextRequest {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new NextRequest("https://getpassme.com/auth/signout", { method: "POST", body, headers });
}

const locationOf = (response: Response) => {
  const location = new URL(response.headers.get("location")!);
  return location.pathname + location.search;
};

let signOut: ReturnType<typeof vi.fn>;
beforeEach(() => {
  signOut = vi.fn(async () => ({ error: null }));
  state.supabase = { auth: { signOut } };
});

describe("/auth/signout", () => {
  it("signs out this device and goes home", async () => {
    const response = await POST(post());
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(locationOf(response)).toBe("/");
  });

  it("honours the scope and a same-site next", async () => {
    const response = await POST(post({ scope: "global", next: "/login" }));
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(locationOf(response)).toBe("/login");
    expect(locationOf(await POST(post({ next: "//evil.test" })))).toBe("/");
  });

  it("refuses a form posted from another site, and signs nobody out", async () => {
    const response = await POST(post({ scope: "global" }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each(["same-origin", "same-site", "none"])("accepts Sec-Fetch-Site: %s", async (site) => {
    const response = await POST(post({}, { "sec-fetch-site": site }));
    expect(response.status).toBe(303);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("works for clients that don't send Sec-Fetch-Site at all", async () => {
    expect((await POST(post())).status).toBe(303);
  });

  it("answers even without Supabase (demo mode)", async () => {
    state.supabase = null;
    expect((await POST(post())).status).toBe(303);
  });
});

describe("a sign-out that fails", () => {
  it("'everywhere' tells the editor it didn't work (?sesion=error), and is logged", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    signOut.mockResolvedValue({ error: { name: "AuthRetryableFetchError", status: 503, message: "down" } });
    const response = await POST(post({ scope: "global", next: "/login" }));
    expect(response.status).toBe(303);
    expect(locationOf(response)).toBe("/dashboard?sesion=error");
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(String(errorLog.mock.calls[0]![0])).toContain("signOut failed");
    expect(String(errorLog.mock.calls[0]![0])).toContain("503");
  });

  it("this device only is logged and goes on to where it was asked", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    signOut.mockResolvedValue({ error: { name: "AuthApiError", status: 500, message: "boom" } });
    const response = await POST(post({ next: "/login" }));
    expect(locationOf(response)).toBe("/login");
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
});
