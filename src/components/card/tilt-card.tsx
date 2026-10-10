"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { shadowOffset, sheenBackground, tiltTransform, type Tilt } from "@/lib/tilt";
import { useTilt } from "./use-tilt";

interface TiltCardProps {
  children: ReactNode;
  /** Classes for the outer box (width, margins…). */
  className?: string;
  /** The child's corner radius, so the light stays inside it. */
  radiusClassName?: string;
  /** Maximum rotation in degrees. */
  max?: number;
  /** A soft contact shadow that slides as the object tips. */
  shadow?: boolean;
  /** The resting sway when nothing drives the tilt (computers only). */
  idle?: boolean;
}

/**
 * On a computer, turns a pass preview into an object: it tips toward the
 * pointer, a light slides across it and its shadow moves the other way. On a
 * phone it is simply the pass, still: nothing to tap, nothing to allow.
 * Renders the child untouched on the server.
 *
 * The resting sway lives on its own element and only pauses while the
 * pointer drives the tilt, so the two never fight over one transform.
 */
export function TiltCard({ children, className, radiusClassName = "rounded-2xl", max, shadow = true, idle = true }: TiltCardProps) {
  const surface = useRef<HTMLDivElement>(null);
  const sheen = useRef<HTMLDivElement>(null);
  const contact = useRef<HTMLDivElement>(null);

  const onFrame = useCallback(
    (tilt: Tilt) => {
      if (surface.current) surface.current.style.transform = tiltTransform(tilt);
      if (sheen.current) sheen.current.style.backgroundImage = sheenBackground(tilt);
      if (contact.current) {
        const { x, y } = shadowOffset(tilt, max);
        contact.current.style.transform = `translate(${x.toFixed(1)}px, ${(y + 14).toFixed(1)}px)`;
      }
    },
    [max],
  );
  const { ref, active, enabled } = useTilt({ max, onFrame });

  return (
    <div ref={ref} className={cn("relative [perspective:1200px]", className)}>
      {shadow ? (
        <div
          ref={contact}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[8%] top-[20%] bottom-0 -z-10 rounded-[40px] bg-ink/45 blur-2xl"
          style={{ transform: "translateY(14px)" }}
        />
      ) : null}
      <div
        className={cn("[transform-style:preserve-3d]", idle && enabled && "animate-sway")}
        style={{ animationPlayState: active ? "paused" : undefined }}
      >
        <div ref={surface} className="relative [transform-style:preserve-3d]" style={{ willChange: enabled ? "transform" : undefined }}>
          {children}
          <div
            ref={sheen}
            aria-hidden="true"
            className={cn("pointer-events-none absolute inset-0 overflow-hidden", radiusClassName)}
            style={{ backgroundImage: enabled ? sheenBackground({ rx: 0, ry: 0, lx: 0.3, ly: 0.25 }) : undefined }}
          />
        </div>
      </div>
    </div>
  );
}
