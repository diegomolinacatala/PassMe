import { afterEach, describe, expect, it, vi } from "vitest";
import { lazyPanel, preloadWhenIdle } from "@/components/card/lazy-panel";
import { containerUnit } from "@/components/card/pass-art";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("containerUnit (pass previews in the browser)", () => {
  it("is a share of the container's width, read from --q where container units don't exist", () => {
    // 75 of the strip's 375 points: a fifth of the width, 20cqw.
    expect(containerUnit(75)).toBe("calc(var(--q, 1cqw) * 20.0000)");
    expect(containerUnit(-0.6)).toBe("calc(var(--q, 1cqw) * -0.1600)");
  });

  it("falls back to 1cqw, so browsers with container units behave as before", () => {
    // --q is only ever set by <CqFallback> on Safari < 16; unset, var() takes its fallback.
    expect(containerUnit(37.5)).toContain("var(--q, 1cqw)");
  });
});

describe("preloadWhenIdle", () => {
  function stubBrowser(connection?: { saveData?: boolean; effectiveType?: string }) {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
    vi.stubGlobal("navigator", { connection });
  }

  it("starts the download a few seconds after the page settles", () => {
    stubBrowser({ effectiveType: "4g" });
    const preload = vi.fn();
    preloadWhenIdle(preload, 3000);
    vi.advanceTimersByTime(2999);
    expect(preload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(preload).toHaveBeenCalledTimes(1);
  });

  it("works without the Network Information API (Safari)", () => {
    stubBrowser(undefined);
    const preload = vi.fn();
    preloadWhenIdle(preload, 10);
    vi.advanceTimersByTime(10);
    expect(preload).toHaveBeenCalledTimes(1);
  });

  it("waits for a pointer, focus or touch on slow connections and when the visitor saves data", () => {
    for (const connection of [{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) {
      stubBrowser(connection);
      const preload = vi.fn();
      preloadWhenIdle(preload, 10);
      vi.advanceTimersByTime(60_000);
      expect(preload, JSON.stringify(connection)).not.toHaveBeenCalled();
    }
  });

  it("can be cancelled when the page unmounts", () => {
    stubBrowser({ effectiveType: "4g" });
    const preload = vi.fn();
    preloadWhenIdle(preload, 10)();
    vi.advanceTimersByTime(100);
    expect(preload).not.toHaveBeenCalled();
  });
});

describe("lazyPanel", () => {
  it("preload() starts the download and never throws if it fails", async () => {
    const load = vi.fn().mockRejectedValue(new Error("Failed to fetch dynamically imported module"));
    const { preload } = lazyPanel(load);
    expect(() => preload()).not.toThrow();
    expect(load).toHaveBeenCalledTimes(1);
    // The rejection was handled: nothing is left for the unhandled-rejection check to find.
    await Promise.resolve();
  });
});
