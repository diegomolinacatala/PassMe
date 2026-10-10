"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { patternLayers } from "@/lib/card/pattern";
import { PatternSvg, type PatternSvgProps } from "./pattern-svg";

const subscribe = () => () => {};

/** How much of the motif must be on screen before it starts drawing. */
const DRAW_THRESHOLD = 0.2;

/**
 * Browser-only <PatternSvg>: renders nothing on the server and draws the
 * motif right after hydration, which keeps the path data out of the HTML and
 * the RSC payload (only the seed travels). The layers are memoized: editor
 * previews re-render on every keystroke, and the style gallery draws all
 * eight motifs at once.
 *
 * Every motif draws itself in (its lines first, then its tints) the moment it
 * scrolls into view, not before; a new variation or motif is a new drawing,
 * so the element is keyed by both.
 */
export function DeferredPatternSvg({ style, ...props }: PatternSvgProps) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [seen, setSeen] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const { pattern, seed } = props.design;
  const { width: boxWidth, height: boxHeight } = props.box;
  const { x, y, r } = props.focus;
  const layers = useMemo(
    () => (isClient ? patternLayers(pattern, seed, { width: boxWidth, height: boxHeight }, { x, y, r }) : null),
    [isClient, pattern, seed, boxWidth, boxHeight, x, y, r],
  );

  // Watches the <svg>: once a fifth of it is on screen, the drawing starts (and stays started).
  const watch = useCallback((element: SVGSVGElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.current?.disconnect();
          observer.current = null;
        }
      },
      { threshold: DRAW_THRESHOLD },
    );
    observer.current.observe(element);
  }, []);

  if (!layers) return null;
  return (
    <PatternSvg
      key={`${pattern}-${seed}`}
      {...props}
      ref={seen ? undefined : watch}
      layers={layers}
      // Out of view: nothing yet (it would be drawn before anyone looks). In view: the drawing.
      style={seen ? style : { ...style, visibility: "hidden" }}
      draw={seen}
    />
  );
}
