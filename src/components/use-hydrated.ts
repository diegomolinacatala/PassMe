"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False while the server HTML is being hydrated, true afterwards. Lets a
 * component read browser-only state (localStorage) right after hydration
 * without a mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
