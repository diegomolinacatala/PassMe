/**
 * The pass as an object on a computer: a small 3D tilt that follows the
 * pointer and a light that slides across the surface. Pure math, shared by
 * <TiltCard> and <CardSheen>; the components only wire the events. Phones
 * get none of this: nothing asks for permissions or depends on holding the
 * phone a certain way.
 */

export interface Tilt {
  /** Rotation around the X axis, in degrees (positive tips the top away). */
  rx: number;
  /** Rotation around the Y axis, in degrees (positive turns the right edge away). */
  ry: number;
  /** Where the light hits, as a share of the surface (0–1 from the left / top). */
  lx: number;
  ly: number;
}

/** Flat, lit from the upper left. */
export const REST_TILT: Tilt = { rx: 0, ry: 0, lx: 0.3, ly: 0.25 };

/** Default maximum rotation, in degrees: enough to feel the object, not a carnival. */
export const MAX_TILT_DEG = 9;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Pointer at (x, y) on the page over `rect`: the surface tips toward the pointer and the light follows it. */
export function tiltFromPointer(x: number, y: number, rect: Rect, max: number = MAX_TILT_DEG): Tilt {
  if (rect.width <= 0 || rect.height <= 0) return REST_TILT;
  const px = clamp((x - rect.left) / rect.width, 0, 1);
  const py = clamp((y - rect.top) / rect.height, 0, 1);
  // (0.5 - py) rather than -(py - 0.5): no negative zero in the CSS.
  return {
    rx: (0.5 - py) * 2 * max,
    ry: (px - 0.5) * 2 * max,
    lx: px,
    ly: py,
  };
}

/** Moves `from` a share `t` (0–1) of the way to `to`: smooth motion between frames. */
export function easeTilt(from: Tilt, to: Tilt, t: number): Tilt {
  const k = clamp(t, 0, 1);
  return {
    rx: from.rx + (to.rx - from.rx) * k,
    ry: from.ry + (to.ry - from.ry) * k,
    lx: from.lx + (to.lx - from.lx) * k,
    ly: from.ly + (to.ly - from.ly) * k,
  };
}

/** True when two tilts are close enough to stop animating between them. */
export function isSettled(a: Tilt, b: Tilt): boolean {
  return Math.abs(a.rx - b.rx) < 0.02 && Math.abs(a.ry - b.ry) < 0.02 && Math.abs(a.lx - b.lx) < 0.002 && Math.abs(a.ly - b.ly) < 0.002;
}

const fixed = (n: number, digits: number) => n.toFixed(digits).replace(/\.?0+$/, "") || "0";

/** The CSS transform for a tilt (the perspective lives on the parent). */
export function tiltTransform({ rx, ry }: Tilt): string {
  return `rotateX(${fixed(rx, 2)}deg) rotateY(${fixed(ry, 2)}deg)`;
}

/** The light: a soft white highlight centered where the surface faces the viewer. */
export function sheenBackground({ lx, ly }: Tilt, strength = 0.22): string {
  const x = fixed(lx * 100, 1);
  const y = fixed(ly * 100, 1);
  return `radial-gradient(60% 70% at ${x}% ${y}%, rgba(255,255,255,${fixed(strength, 3)}), rgba(255,255,255,0) 70%)`;
}

/** The contact shadow slides the opposite way to the tilt, as if the light stayed put. */
export function shadowOffset({ rx, ry }: Tilt, max: number = MAX_TILT_DEG): { x: number; y: number } {
  if (max <= 0) return { x: 0, y: 0 };
  return { x: -(ry / max) * 10, y: (rx / max) * 10 };
}
