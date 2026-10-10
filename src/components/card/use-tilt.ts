"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { easeTilt, isSettled, MAX_TILT_DEG, REST_TILT, tiltFromPointer, type Tilt } from "@/lib/tilt";

/** Share of the remaining distance covered each frame: fast to follow, soft to settle. */
const FOLLOW = 0.14;

const noop = () => () => {};

/** A media query as a store: false on the server, the browser's answer after hydration. */
function useMediaQuery(query: string): boolean {
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

export interface UseTiltOptions {
  /** Maximum rotation in degrees. */
  max?: number;
  /** Called on every animation frame with the current tilt: write it to the DOM here. */
  onFrame: (tilt: Tilt) => void;
}

export interface UseTiltResult {
  /** Put it on the element the pointer is measured against. */
  ref: (element: HTMLElement | null) => void;
  /** True while the pointer drives the tilt: the resting animation should pause. */
  active: boolean;
  /**
   * True when the tilt can happen at all: in the browser, with a fine pointer
   * (a mouse or trackpad) and no reduced-motion preference. Phones get a still object.
   */
  enabled: boolean;
}

/**
 * Drives a tilt from the pointer on devices that have one, easing between
 * frames outside React's render cycle. Does nothing on touch devices and
 * under prefers-reduced-motion: no sensors, no permissions, nothing to tap.
 */
export function useTilt({ max = MAX_TILT_DEG, onFrame }: UseTiltOptions): UseTiltResult {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const enabled = hydrated && !reduceMotion && finePointer;
  // The latest callback, read from the animation loop without restarting it.
  const frameCallback = useRef(onFrame);
  useEffect(() => {
    frameCallback.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!element || !enabled) return;
    let current = REST_TILT;
    let target = REST_TILT;
    let frame: number | null = null;

    const tick = () => {
      frame = null;
      const next = easeTilt(current, target, FOLLOW);
      current = isSettled(next, target) ? target : next;
      frameCallback.current(current);
      if (current !== target) frame = requestAnimationFrame(tick);
    };
    const aim = (tilt: Tilt) => {
      target = tilt;
      if (frame === null) frame = requestAnimationFrame(tick);
    };
    const onMove = (event: PointerEvent) => {
      setActive(true);
      aim(tiltFromPointer(event.clientX, event.clientY, element.getBoundingClientRect(), max));
    };
    const onLeave = () => {
      aim(REST_TILT);
      setActive(false);
    };
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [element, enabled, max]);

  return { ref: setElement, active, enabled };
}
