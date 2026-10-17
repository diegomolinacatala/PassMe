"use client";

import { useEffect } from "react";

/** Elements that are a container for `containerUnit` (see pass-art.tsx). */
const SELECTOR = "[data-cq]";

/**
 * Safari before 16.0 (iOS 15) has no container query units, so the pass
 * previews would collapse to nothing. There, this measures every `[data-cq]`
 * box and keeps `--q` (1% of its width, in px) up to date; `containerUnit`
 * uses it in place of `1cqw`. Mount it once per page. Elsewhere it does
 * one feature check and nothing else.
 */
export function CqFallback(): null {
  useEffect(() => {
    if (typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports("width", "1cqw")) return;

    const sizes = new ResizeObserver((entries) => {
      for (const entry of entries) {
        (entry.target as HTMLElement).style.setProperty("--q", `${entry.contentRect.width / 100}px`);
      }
    });
    const watched = new WeakSet<Element>();
    const watchAll = () => {
      document.querySelectorAll(SELECTOR).forEach((element) => {
        if (watched.has(element)) return;
        watched.add(element);
        sizes.observe(element);
      });
    };
    watchAll();
    // Previews appear later too (a tab opens, a bottom sheet mounts).
    const arrivals = new MutationObserver(watchAll);
    arrivals.observe(document.body, { childList: true, subtree: true });
    return () => {
      sizes.disconnect();
      arrivals.disconnect();
    };
  }, []);
  return null;
}
