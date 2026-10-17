"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A media query as a store: false on the server and while hydrating (so the
 * first client render matches the HTML), the browser's answer afterwards, and
 * it follows the query as the window changes.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
