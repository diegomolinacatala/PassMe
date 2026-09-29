"use client";

import { useEffect } from "react";
import { checkSignedInAction } from "@/app/login/actions";
import { clearStoredDraft } from "@/lib/card/draft-storage";

/**
 * Keeps the tabs of one browser in step during sign-in: someone who asked for
 * a code in one tab may press the email's button instead, which signs them in
 * from a new tab. The tab still waiting for the code should then move on.
 */

const CHANNEL = "passme-auth";
const MIN_CHECK_INTERVAL_MS = 1500;

function openChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

/** Rendered by signed-in pages: tells the waiting tab, and drops the draft the card was made from. */
export function SignedInBeacon() {
  useEffect(() => {
    clearStoredDraft();
    const channel = openChannel();
    channel?.postMessage("signed-in");
    channel?.close();
  }, []);
  return null;
}

/**
 * While `enabled`, calls `onSignedIn` once this browser has a session: checked
 * when the tab becomes visible again and when another tab announces it.
 * `onSignedIn` should be stable (useCallback).
 */
export function useSignedInElsewhere(enabled: boolean, onSignedIn: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    // Set once signed in, and when disabled: an answer still on its way is then ignored.
    let done = false;
    let lastCheck = 0;

    async function check() {
      if (busy || done || Date.now() - lastCheck < MIN_CHECK_INTERVAL_MS) return;
      busy = true;
      lastCheck = Date.now();
      try {
        const signedIn = await checkSignedInAction();
        if (signedIn && !done) {
          done = true;
          onSignedIn();
        }
      } catch {
        // Offline or a deploy in between: the next focus tries again.
      } finally {
        busy = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const channel = openChannel();
    if (channel) channel.onmessage = () => void check();

    return () => {
      done = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      channel?.close();
    };
  }, [enabled, onSignedIn]);
}
