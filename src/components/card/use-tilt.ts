"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { easeTilt, isSettled, MAX_TILT_DEG, REST_TILT, tiltFromOrientation, tiltFromPointer, tiltFromScroll, type Tilt } from "@/lib/tilt";

/** Share of the remaining distance covered each frame: fast to follow, soft to settle. */
const FOLLOW = 0.14;

interface DeviceOrientationEventWithPermission {
  requestPermission?: () => Promise<"granted" | "denied">;
}

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
  /** Ask iOS for motion access on the first tap (a system dialog). Off by default. */
  askMotion?: boolean;
  /** Called on every animation frame with the current tilt: write it to the DOM here. */
  onFrame: (tilt: Tilt) => void;
}

export interface UseTiltResult {
  /** Put it on the element the pointer is measured against. */
  ref: (element: HTMLElement | null) => void;
  /** True while something (pointer, phone) drives the tilt: the resting animation should stop. */
  active: boolean;
  /** True when motion is allowed at all (in the browser, without a reduced-motion preference). */
  enabled: boolean;
}

/**
 * Drives a tilt from the pointer (devices with a fine pointer) or from the
 * phone's orientation (touch devices), easing between frames outside React's
 * render cycle. Honors prefers-reduced-motion by doing nothing.
 */
export function useTilt({ max = MAX_TILT_DEG, askMotion = false, onFrame }: UseTiltOptions): UseTiltResult {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const enabled = hydrated && !reduceMotion;
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
    const cleanups: Array<() => void> = [];

    if (finePointer) {
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
      cleanups.push(() => {
        element.removeEventListener("pointermove", onMove);
        element.removeEventListener("pointerleave", onLeave);
      });
    } else {
      // Until the sensors speak (iOS needs a permission; some phones have none), scrolling moves the light.
      let neutral: number | null = null;
      const onScroll = () => {
        if (neutral !== null) return;
        aim(tiltFromScroll(element.getBoundingClientRect(), window.innerHeight, max));
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener("scroll", onScroll));

      if ("DeviceOrientationEvent" in window) {
        const onOrientation = (event: DeviceOrientationEvent) => {
          if (event.beta === null || event.gamma === null) return;
          // The first reading is how the phone is being held: that's "flat".
          if (neutral === null) {
            neutral = event.beta;
            setActive(true);
          }
          aim(tiltFromOrientation(event.beta, event.gamma, max, neutral));
        };
        window.addEventListener("deviceorientation", onOrientation);
        cleanups.push(() => window.removeEventListener("deviceorientation", onOrientation));

        // iOS only sends the events after a permission granted from a tap.
        const Orientation = window.DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission;
        if (askMotion && typeof Orientation.requestPermission === "function") {
          const ask = () => {
            Orientation.requestPermission?.().catch(() => undefined);
          };
          element.addEventListener("click", ask, { once: true });
          cleanups.push(() => element.removeEventListener("click", ask));
        }
      }
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [element, enabled, finePointer, max, askMotion]);

  return { ref: setElement, active, enabled };
}
