"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sheenBackground, type Tilt } from "@/lib/tilt";
import { useTilt } from "./use-tilt";

/**
 * The light on the public card's stub: it follows the pointer over the card
 * (or the phone's tilt), so the card reads as printed stock instead of a
 * colored box. Measured against its parent, where it sits as an overlay.
 */
export function CardSheen() {
  const sheen = useRef<HTMLDivElement>(null);
  const [parent, setParent] = useState<HTMLElement | null>(null);
  const onFrame = useCallback((tilt: Tilt) => {
    if (sheen.current) sheen.current.style.backgroundImage = sheenBackground(tilt, 0.16);
  }, []);
  const { ref, enabled } = useTilt({ max: 0, onFrame });

  useEffect(() => {
    if (parent) ref(parent);
  }, [parent, ref]);

  return (
    <div
      ref={(element) => {
        sheen.current = element;
        const next = element?.parentElement ?? null;
        setParent((prev) => (prev === next ? prev : next));
      }}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ backgroundImage: enabled ? sheenBackground({ rx: 0, ry: 0, lx: 0.3, ly: 0.25 }, 0.16) : undefined }}
    />
  );
}
