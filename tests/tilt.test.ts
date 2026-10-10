import { describe, expect, it } from "vitest";
import {
  easeTilt,
  HELD_BETA,
  isSettled,
  MAX_TILT_DEG,
  REST_TILT,
  shadowOffset,
  sheenBackground,
  tiltFromOrientation,
  tiltFromPointer,
  tiltTransform,
} from "@/lib/tilt";

const RECT = { left: 100, top: 50, width: 400, height: 200 };

describe("tilt: the pass as an object", () => {
  it("rests flat with the light up and to the left", () => {
    expect(tiltTransform(REST_TILT)).toBe("rotateX(0deg) rotateY(0deg)");
    expect(sheenBackground(REST_TILT)).toContain("at 30% 25%");
  });

  it("tips toward the pointer and moves the light under it", () => {
    const center = tiltFromPointer(300, 150, RECT);
    expect(center.rx).toBeCloseTo(0);
    expect(center.ry).toBeCloseTo(0);
    const topRight = tiltFromPointer(500, 50, RECT);
    expect(topRight.ry).toBeCloseTo(MAX_TILT_DEG);
    expect(topRight.rx).toBeCloseTo(MAX_TILT_DEG);
    expect(topRight.lx).toBe(1);
    expect(topRight.ly).toBe(0);
  });

  it("clamps a pointer outside the surface and ignores an empty one", () => {
    const outside = tiltFromPointer(-1000, 9000, RECT);
    expect(outside.ry).toBeCloseTo(-MAX_TILT_DEG);
    expect(outside.rx).toBeCloseTo(-MAX_TILT_DEG);
    expect(tiltFromPointer(10, 10, { ...RECT, width: 0 })).toBe(REST_TILT);
  });

  it("reads the phone's orientation from how it was held at first", () => {
    expect(tiltFromOrientation(HELD_BETA, 0)).toEqual({ rx: 0, ry: 0, lx: 0.5, ly: 0.5 });
    expect(tiltFromOrientation(10, 0, MAX_TILT_DEG, 10).rx).toBe(0);
    const tipped = tiltFromOrientation(HELD_BETA + 14, 14);
    expect(tipped.ry).toBeCloseTo(MAX_TILT_DEG / 2);
    expect(tipped.rx).toBeCloseTo(-MAX_TILT_DEG / 2);
    expect(tiltFromOrientation(HELD_BETA + 500, -500).ry).toBeCloseTo(-MAX_TILT_DEG);
    expect(tiltFromOrientation(null, 3)).toBe(REST_TILT);
    expect(tiltFromOrientation(Number.NaN, 3)).toBe(REST_TILT);
  });

  it("eases toward the target and knows when it has arrived", () => {
    const target = { rx: 10, ry: -10, lx: 1, ly: 0 };
    const halfway = easeTilt(REST_TILT, target, 0.5);
    expect(halfway.rx).toBe(5);
    expect(halfway.ry).toBe(-5);
    expect(easeTilt(REST_TILT, target, 2)).toEqual(target);
    expect(isSettled(halfway, target)).toBe(false);
    expect(isSettled({ ...target, rx: 10.01 }, target)).toBe(true);
  });

  it("slides the shadow the other way and writes compact CSS", () => {
    expect(shadowOffset({ rx: MAX_TILT_DEG, ry: -MAX_TILT_DEG, lx: 0, ly: 0 })).toEqual({ x: 10, y: 10 });
    expect(shadowOffset(REST_TILT, 0)).toEqual({ x: 0, y: 0 });
    expect(tiltTransform({ rx: 1.234, ry: -5, lx: 0, ly: 0 })).toBe("rotateX(1.23deg) rotateY(-5deg)");
    expect(sheenBackground({ rx: 0, ry: 0, lx: 0.333, ly: 1 }, 0.1)).toBe(
      "radial-gradient(60% 70% at 33.3% 100%, rgba(255,255,255,0.1), rgba(255,255,255,0) 70%)",
    );
  });
});
