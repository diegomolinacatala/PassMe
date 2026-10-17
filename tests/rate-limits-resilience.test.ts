import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { fakeSupabase } from "./helpers/fake-supabase";

/*
 * What the shared limiter does when Postgres can't answer: count in memory
 * (and say so, loudly but not endlessly), or refuse when the caller asked it to.
 */

const state: { admin: TypedSupabaseClient | null } = { admin: null };
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => state.admin }));

const { createSharedRateLimiter } = await import("@/lib/data/rate-limits");

const down = (code = "08006") => fakeSupabase(() => ({ error: { message: "connection refused", code } })).client;
const upAllowing = (allowed: boolean) => fakeSupabase(() => ({ data: [{ allowed, retry_after: 7 }] })).client;

let errorLog: ReturnType<typeof vi.spyOn>;
let clock = Date.now();
beforeEach(() => {
  vi.useFakeTimers();
  // Each test starts ten minutes after the previous one, so the once-a-minute log throttle never leaks across tests.
  clock += 10 * 60_000;
  vi.setSystemTime(clock);
  state.admin = null;
  errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("when the shared counter is unreachable", () => {
  it("counts in memory, flags the answer as degraded and logs an error with the database code", async () => {
    state.admin = down("PGRST202");
    const limiter = createSharedRateLimiter({ name: "t-memory", limit: 2, windowMs: 60_000 });
    expect(await limiter.check("a")).toMatchObject({ ok: true, degraded: true });
    expect(await limiter.check("a")).toMatchObject({ ok: true, degraded: true });
    expect(await limiter.check("a")).toMatchObject({ ok: false, degraded: true });
    expect(errorLog).toHaveBeenCalledTimes(1);
    const line = String(errorLog.mock.calls[0]![0]);
    expect(line).toContain("PGRST202");
    expect(line).toContain("t-memory");
  });

  it("logs at most once a minute, however many limiters and calls fail", async () => {
    state.admin = down();
    const one = createSharedRateLimiter({ name: "t-a", limit: 5, windowMs: 60_000 });
    const other = createSharedRateLimiter({ name: "t-b", limit: 5, windowMs: 60_000 });
    for (let i = 0; i < 20; i += 1) {
      await one.check(`k${i}`);
      await other.check(`k${i}`);
    }
    expect(errorLog).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(59_000);
    await one.check("again");
    expect(errorLog).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_000);
    await one.check("later");
    expect(errorLog).toHaveBeenCalledTimes(2);
  });

  it("also treats an answer it can't read as unreachable", async () => {
    state.admin = fakeSupabase(() => ({ data: "nonsense" })).client;
    const limiter = createSharedRateLimiter({ name: "t-garbage", limit: 1, windowMs: 60_000 });
    expect(await limiter.check("x")).toMatchObject({ ok: true, degraded: true });
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  it("survives a client that throws", async () => {
    state.admin = {
      rpc: () => {
        throw new Error("socket hang up");
      },
    } as unknown as TypedSupabaseClient;
    const limiter = createSharedRateLimiter({ name: "t-throws", limit: 1, windowMs: 60_000 });
    expect(await limiter.check("x")).toMatchObject({ ok: true, degraded: true });
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
});

describe("failClosed limiters", () => {
  it("refuse while the shared counter is unreachable, without touching memory", async () => {
    state.admin = down();
    const limiter = createSharedRateLimiter({ name: "t-closed", limit: 5, windowMs: 60_000, failClosed: true });
    for (let i = 0; i < 3; i += 1) {
      expect(await limiter.check("x")).toEqual({ ok: false, remaining: 0, retryAfterSeconds: 60, degraded: true });
    }
    expect(String(errorLog.mock.calls[0]![0])).toContain("fail closed");

    // Back up: a normal answer, and nothing was counted meanwhile.
    state.admin = upAllowing(true);
    expect(await limiter.check("x")).toMatchObject({ ok: true, degraded: false });
  });

  it("use memory when there is no secret key at all (demo, tests)", async () => {
    state.admin = null;
    const limiter = createSharedRateLimiter({ name: "t-closed-demo", limit: 1, windowMs: 60_000, failClosed: true });
    expect(await limiter.check("x")).toMatchObject({ ok: true, degraded: false });
    expect(await limiter.check("x")).toMatchObject({ ok: false, degraded: false });
  });
});

describe("when the shared counter answers", () => {
  it("is not degraded, and says how long to wait", async () => {
    state.admin = upAllowing(false);
    const limiter = createSharedRateLimiter({ name: "t-up", limit: 1, windowMs: 60_000 });
    expect(await limiter.check("x")).toEqual({ ok: false, remaining: 0, retryAfterSeconds: 7, degraded: false });
    expect(errorLog).not.toHaveBeenCalled();
  });
});

describe("a production project without its secret key", () => {
  it("is reported (once a minute) because limits are then per instance only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const limiter = createSharedRateLimiter({ name: "t-nokey", limit: 5, windowMs: 60_000 });
    await limiter.check("a");
    await limiter.check("b");
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(String(errorLog.mock.calls[0]![0])).toContain("SUPABASE_SECRET_KEY");
  });

  it("is not reported in demo mode, which has no Supabase on purpose", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const limiter = createSharedRateLimiter({ name: "t-demo", limit: 5, windowMs: 60_000 });
    await limiter.check("a");
    expect(errorLog).not.toHaveBeenCalled();
  });
});
