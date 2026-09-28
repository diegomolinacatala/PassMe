"use client";

import { useMemo, useSyncExternalStore } from "react";
import { patternLayers } from "@/lib/card/pattern";
import { PatternSvg, type PatternSvgProps } from "./pattern-svg";

const subscribe = () => () => {};

/**
 * Browser-only <PatternSvg>: renders nothing on the server and draws the
 * motif right after hydration, which keeps the path data out of the HTML and
 * the RSC payload (only the seed travels). The layers are memoized: editor
 * previews re-render on every keystroke, and the style gallery draws all
 * eight motifs at once.
 */
export function DeferredPatternSvg({ style, ...props }: PatternSvgProps) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const { pattern, seed } = props.design;
  const { width: boxWidth, height: boxHeight } = props.box;
  const { x, y, r } = props.focus;
  const layers = useMemo(
    () => (isClient ? patternLayers(pattern, seed, { width: boxWidth, height: boxHeight }, { x, y, r }) : null),
    [isClient, pattern, seed, boxWidth, boxHeight, x, y, r],
  );
  if (!layers) return null;
  return <PatternSvg {...props} layers={layers} style={{ ...style, animation: "pattern-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both" }} />;
}
