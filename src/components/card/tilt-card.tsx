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
  /** Ask iOS for motion access on the first tap (only where the card is the point of the page). */
  askMotion?: boolean;
  /** A soft contact shadow that slides as the object tips. */
  shadow?: boolean;
  /** The resting sway when nothing drives the tilt. */
  idle?: boolean;
}

/**
 * Turns a pass preview into an object: it tips toward the pointer (or with
 * the phone), a light slides across it and its shadow moves the other way.
 * Renders the child untouched on the server; motion only arrives in the
 * browser, and not at all with prefers-reduced-motion.
 */
export function TiltCard({ children, className, radiusClassName = "rounded-2xl", max, askMotion, shadow = true, idle = true }: TiltCardProps) {
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
  const { ref, active, enabled } = useTilt({ max, askMotion, onFrame });

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
        ref={surface}
        className={cn("relative [transform-style:preserve-3d]", idle && enabled && !active && "animate-sway")}
        style={{ willChange: enabled ? "transform" : undefined }}
      >
        {children}
        <div
          ref={sheen}
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-0 overflow-hidden", radiusClassName)}
          style={{ backgroundImage: enabled ? sheenBackground({ rx: 0, ry: 0, lx: 0.3, ly: 0.25 }) : undefined }}
        />
      </div>
    </div>
  );
}
