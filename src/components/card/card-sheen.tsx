"use client";

import { useCallback, useRef } from "react";
import { sheenBackground, type Tilt } from "@/lib/tilt";
import { useTilt } from "./use-tilt";

/** A little stronger than the hero's: the stub is seen on a phone, often outdoors. */
const STUB_LIGHT = 0.2;
const REST_LIGHT = sheenBackground({ rx: 0, ry: 0, lx: 0.3, ly: 0.25 }, STUB_LIGHT);

/**
 * The light on the public card's stub: it follows the pointer over the card
 * (or the phone's tilt), so the card reads as printed stock instead of a
 * colored box. Measured against its parent, where it sits as an overlay.
 */
export function CardSheen() {
  const sheen = useRef<HTMLDivElement>(null);
  const onFrame = useCallback((tilt: Tilt) => {
    if (sheen.current) sheen.current.style.backgroundImage = sheenBackground(tilt, STUB_LIGHT);
  }, []);
  const { ref, enabled } = useTilt({ max: 0, onFrame });

  return (
    <div
      ref={(element) => {
        sheen.current = element;
        ref(element?.parentElement ?? null);
      }}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ backgroundImage: enabled ? REST_LIGHT : undefined }}
    />
  );
}
