"use client";

import { useSyncExternalStore } from "react";
import { PatternSvg, type PatternSvgProps } from "./pattern-svg";

const subscribe = () => () => {};

/**
 * Browser-only <PatternSvg>: renders nothing on the server and draws the
 * pattern right after hydration. A rosette is tens of KB of path data; this
 * keeps it out of the HTML and the RSC payload (only the seed travels).
 */
export function DeferredPatternSvg({ style, ...props }: PatternSvgProps) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!isClient) return null;
  return <PatternSvg {...props} style={{ ...style, animation: "pattern-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both" }} />;
}
