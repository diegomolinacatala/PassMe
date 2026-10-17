"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { patternLayers } from "@/lib/card/pattern";
import { PatternSvg, type PatternSvgProps } from "./pattern-svg";

const subscribe = () => () => {};

/** How much of the motif must be on screen before it starts drawing. */
const DRAW_THRESHOLD = 0.2;

/** The path data is worked out a little before the motif scrolls into view, so drawing starts without a hitch. */
const NEAR_MARGIN = "300px";

/**
 * Browser-only <PatternSvg>: renders nothing on the server and draws the
 * motif after hydration, which keeps the path data out of the HTML and the RSC
 * payload (only the seed travels). The layers are memoized: editor previews
 * re-render on every keystroke, and the style gallery draws all eight motifs
 * at once.
 *
 * Every motif draws itself in (its lines first, then its tints) the moment it
 * scrolls into view, not before; a new variation or motif is a new drawing,
 * so the element is keyed by both. The paths themselves are only generated
 * once the motif is near the screen: the landing has thirteen of them and a
 * phone shows two or three (a hidden preview never generates anything).
 */
export function DeferredPatternSvg({ style, ...props }: PatternSvgProps) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [near, setNear] = useState(false);
  const [seen, setSeen] = useState(false);
  const stopWatching = useRef<(() => void) | null>(null);
  const { pattern, seed } = props.design;
  const { width: boxWidth, height: boxHeight } = props.box;
  const { x, y, r } = props.focus;
  const layers = useMemo(
    () => (isClient && near ? patternLayers(pattern, seed, { width: boxWidth, height: boxHeight }, { x, y, r }) : null),
    [isClient, near, pattern, seed, boxWidth, boxHeight, x, y, r],
  );

  // Watches the <svg>: "near" starts the generation, a fifth of it on screen starts the drawing (and it stays started).
  const watch = useCallback((element: SVGSVGElement | null) => {
    stopWatching.current?.();
    stopWatching.current = null;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      setSeen(true);
      return;
    }
    const nearObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNear(true);
        nearObserver.disconnect();
      },
      { rootMargin: NEAR_MARGIN },
    );
    const seenObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNear(true);
        setSeen(true);
        nearObserver.disconnect();
        seenObserver.disconnect();
        stopWatching.current = null;
      },
      { threshold: DRAW_THRESHOLD },
    );
    nearObserver.observe(element);
    seenObserver.observe(element);
    stopWatching.current = () => {
      nearObserver.disconnect();
      seenObserver.disconnect();
    };
  }, []);

  if (!isClient) return null;
  if (!layers) {
    // Nothing to draw yet: an empty, hidden <svg> for the observers to watch.
    return (
      <svg
        ref={watch}
        width={props.width}
        height={props.height}
        viewBox={`0 0 ${props.box.width} ${props.box.height}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        style={{ ...style, visibility: "hidden" }}
      />
    );
  }
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
