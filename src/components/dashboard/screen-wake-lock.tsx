"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while "Mi QR" is open, so it doesn't go dark while the
 * other person finds their camera. Browsers drop the lock whenever the page is
 * hidden, so it's asked for again on return. Without support (or permission)
 * nothing happens: the QR works the same.
 */
export function ScreenWakeLock() {
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let active = true;

    async function request() {
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible" || sentinel) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (!active) {
          await lock.release();
          return;
        }
        sentinel = lock;
        lock.addEventListener("release", () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // Battery saver, no permission, an old browser: nothing to tell the person.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, []);
  return null;
}
