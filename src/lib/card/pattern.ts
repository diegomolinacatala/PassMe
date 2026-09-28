/**
 * Generative motifs for the pass artwork.
 *
 * Every card gets its own variation: a stored random seed drives a tiny PRNG,
 * so the same card always draws the same artwork while two people (almost)
 * never share one. The output is plain SVG path data, rendered identically by
 * the browser (editor preview, public page) and by Satori/resvg on the server
 * (wallet images).
 *
 * Pure and dependency-free on purpose: imported by client and server code.
 */

export const PATTERN_KINDS = ["orbitas", "relieve", "halo", "trama", "cinta", "rayos", "monograma", "liso"] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

export const DEFAULT_PATTERN: PatternKind = "orbitas";

export const PATTERN_LABELS: Record<PatternKind, { name: string; description: string }> = {
  orbitas: { name: "Órbitas", description: "Anillos finos alrededor de tu foto, con un par de lunas." },
  relieve: { name: "Relieve", description: "Curvas de nivel, como un mapa. Cada variación es un monte distinto." },
  halo: { name: "Halo", description: "Círculos de color que se superponen detrás de tu foto." },
  trama: { name: "Trama", description: "Puntos de imprenta que se desvanecen hacia tu nombre." },
  cinta: { name: "Cinta", description: "Una cinta de líneas que se retuerce detrás de tu foto." },
  rayos: { name: "Rayos", description: "Un sol de líneas finas que sale de tu foto." },
  monograma: { name: "Monograma", description: "Tu inicial en cursiva, enorme, como un sello de papelería." },
  liso: { name: "Liso", description: "Solo color. Para los minimalistas." },
};

/** Motifs stored before the 2026-09 redesign, read as their closest successor. */
const LEGACY_PATTERNS: Readonly<Record<string, PatternKind>> = { sello: "orbitas", senal: "orbitas", ondas: "cinta" };

export function isPatternKind(value: unknown): value is PatternKind {
  return typeof value === "string" && (PATTERN_KINDS as readonly string[]).includes(value);
}

/** Motifs drawn from the card's seed (the letter and the plain style look the same every time). */
export function hasVariations(kind: PatternKind): boolean {
  return kind !== "monograma" && kind !== "liso";
}

/** Line and dot motifs fade out under the name; a fade across flat tints reads as a smudge. */
export function fadesUnderText(kind: PatternKind): boolean {
  return kind !== "halo";
}

/** A stored motif (current or legacy) as a current kind; null when unknown. */
export function toPatternKind(value: unknown): PatternKind | null {
  if (isPatternKind(value)) return value;
  return typeof value === "string" ? (LEGACY_PATTERNS[value] ?? null) : null;
}

/** One SVG `<path>`: stroked lines or filled shapes, drawn in the detail color. */
export interface PatternLayer {
  d: string;
  mode: "stroke" | "fill";
  /** Stroke width in the same units as the box. Ignored for fills. */
  width: number;
  opacity: number;
  /** Stroke dash array in box units (dotted orbits). */
  dash?: string;
  /** Round caps: with near-zero segments they draw dots (halftone). */
  cap?: "round";
}

export interface PatternBox {
  width: number;
  height: number;
}

/** Where the artwork is anchored (usually the avatar): center and radius of the clear zone. */
export interface PatternFocus {
  x: number;
  y: number;
  r: number;
}

// --- Seeded randomness -------------------------------------------------------

/** FNV-1a: stable 32-bit hash of the seed string. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for visual variety. */
function rng(seed: number): () => number {
  let a = seed || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;

const between = (random: Random, min: number, max: number) => min + (max - min) * random();
const intBetween = (random: Random, min: number, max: number) => Math.floor(between(random, min, max + 1));
const pick = <T>(random: Random, options: ReadonlyArray<T>): T => options[intBetween(random, 0, options.length - 1)]!;

// --- Geometry & compact path encoding ----------------------------------------

const TAU = Math.PI * 2;

type Point = readonly [number, number];

/** Rounds to 1 decimal and drops the leading zero ("-0.4" → "-.4"). */
function num(n: number): string {
  const s = (Math.round(n * 10) / 10).toString();
  return s.replace(/^(-?)0\./, "$1.");
}

/** Polyline with relative moves: keeps paths small enough to inline in HTML. */
function polyline(points: ReadonlyArray<Point>, closed: boolean): string {
  if (points.length === 0) return "";
  const [x0, y0] = points[0]!;
  let d = `M${num(x0)} ${num(y0)}l`;
  let px = Math.round(x0 * 10) / 10;
  let py = Math.round(y0 * 10) / 10;
  const parts: string[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const [x, y] = points[i]!;
    const rx = Math.round(x * 10) / 10;
    const ry = Math.round(y * 10) / 10;
    const dx = num(rx - px);
    const dy = num(ry - py);
    parts.push(`${dx}${dy.startsWith("-") ? "" : " "}${dy}`);
    px = rx;
    py = ry;
  }
  d += parts.join(" ").replace(/ -/g, "-");
  return closed ? `${d}z` : d;
}

/**
 * Only the stretches of a curve that can be seen: points outside the box
 * (plus a margin) are dropped, so huge off-canvas rings cost nothing.
 */
function visiblePath(points: ReadonlyArray<Point>, box: PatternBox, closed: boolean, margin = 2): string {
  const inside = ([x, y]: Point) => x >= -margin && x <= box.width + margin && y >= -margin && y <= box.height + margin;
  let sequence = points;
  if (closed) {
    const start = points.findIndex((p) => !inside(p));
    if (start === -1) return polyline(points, true);
    sequence = [...points.slice(start), ...points.slice(0, start), points[start]!];
  }
  const runs: Point[][] = [];
  let run: Point[] = [];
  sequence.forEach((point, i) => {
    if (inside(point)) {
      if (run.length === 0 && i > 0) run.push(sequence[i - 1]!);
      run.push(point);
    } else if (run.length > 0) {
      run.push(point);
      runs.push(run);
      run = [];
    }
  });
  if (run.length > 0) runs.push(run);
  return runs.map((r) => polyline(r, false)).join("");
}

function circle(cx: number, cy: number, r: number): string {
  return `M${num(cx - r)} ${num(cy)}a${num(r)} ${num(r)} 0 1 0 ${num(r * 2)} 0a${num(r)} ${num(r)} 0 1 0 ${num(-r * 2)} 0`;
}

/** Distance from the focus to the farthest corner of the box. */
function reachOf(box: PatternBox, focus: PatternFocus): number {
  return Math.hypot(Math.max(focus.x, box.width - focus.x), Math.max(focus.y, box.height - focus.y));
}

/** A smooth closed wave around the circle, normalized to [-1, 1]. */
function terrainWave(random: Random): (t: number) => number {
  const parts = [2, 3, 4, 5].map((h) => ({ h, a: between(random, 0.35, 1) / h ** 0.7, p: between(random, 0, TAU) }));
  const total = parts.reduce((sum, part) => sum + part.a, 0);
  return (t) => parts.reduce((sum, part) => sum + part.a * Math.sin(part.h * t + part.p), 0) / total;
}

// --- Motifs ------------------------------------------------------------------

interface MotifContext {
  box: PatternBox;
  focus: PatternFocus;
  random: Random;
  /** Motif scale: 1 on the Apple strip, where the avatar radius is 38 pt. */
  k: number;
}

/** Thin orbits around the avatar that open up as they go, with a few moons. */
function orbitas({ box, focus, random, k }: MotifContext): PatternLayer[] {
  const reach = reachOf(box, focus);
  const growth = between(random, 1.3, 1.48);
  let gap = between(random, 10, 13) * k;
  const radii: number[] = [];
  for (let r = focus.r + 12 * k; r < reach + gap; r += gap, gap *= growth) radii.push(r);

  const dotted = intBetween(random, 1, Math.min(2, radii.length - 1));
  const layers: PatternLayer[] = radii.map((r, i) =>
    i === dotted
      ? { d: circle(focus.x, focus.y, r), mode: "stroke", width: 1.2 * k, opacity: 0.7, dash: `0.01 ${num(3.4 * k)}`, cap: "round" }
      : { d: circle(focus.x, focus.y, r), mode: "stroke", width: (i === 0 ? 0.8 : 0.55) * k, opacity: Math.max(0.32, 0.85 - i * 0.1) },
  );

  // Moons on the inner orbits, where they can be seen — never in the wedge
  // left of the avatar, where the name sits.
  const moons: string[] = [];
  const taken = new Set<number>();
  for (const size of [3.4, 2.1, 1.4]) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const ring = intBetween(random, 0, Math.min(3, radii.length - 1));
      const angle = between(random, -0.72, 0.72) * Math.PI;
      const x = focus.x + radii[ring]! * Math.cos(angle);
      const y = focus.y + radii[ring]! * Math.sin(angle);
      const margin = (size + 5) * k;
      if (taken.has(ring) || x < margin || x > box.width - margin || y < margin || y > box.height - margin) continue;
      taken.add(ring);
      moons.push(circle(x, y, size * k));
      break;
    }
  }
  if (moons.length > 0) layers.push({ d: moons.join(""), mode: "fill", width: 0, opacity: 1 });
  return layers;
}

/** Contour lines of a hill whose summit is the avatar: every seed is another hill. */
function relieve({ box, focus, random, k }: MotifContext): PatternLayer[] {
  const reach = reachOf(box, focus);
  const spacing = between(random, 7.5, 9) * k;
  const first = focus.r + 9 * k;
  const drift = spacing * between(random, 0.12, 0.28);
  const driftAngle = between(random, 0, TAU);
  const wobble = spacing * 0.2;
  const [near, far] = [terrainWave(random), terrainWave(random)];
  const count = Math.ceil((reach + drift * 40 - first) / spacing);

  const thin: string[] = [];
  const index: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = first + i * spacing;
    const cx = focus.x + Math.cos(driftAngle) * drift * i;
    const cy = focus.y + Math.sin(driftAngle) * drift * i;
    const blend = i / count;
    const steps = Math.min(720, Math.max(72, Math.ceil((TAU * base) / 3.5)));
    const points: Point[] = [];
    for (let s = 0; s < steps; s += 1) {
      const t = (s / steps) * TAU;
      const r = base + wobble * i * ((1 - blend) * near(t) + blend * far(t));
      points.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    const path = visiblePath(points, box, true);
    if (!path) continue;
    // Every fifth line is an "index contour", slightly bolder, like on a real map.
    (i % 5 === 4 ? index : thin).push(path);
  }
  return [
    { d: thin.join(""), mode: "stroke", width: 0.5 * k, opacity: 0.6 },
    { d: index.join(""), mode: "stroke", width: 0.95 * k, opacity: 0.75 },
  ].filter((layer) => layer.d.length > 0) as PatternLayer[];
}

/**
 * Three tinted discs behind the avatar, each one a little off-center, so
 * their overlaps read as crescents — an eclipse in the card's own inks.
 */
function halo({ focus, random, k }: MotifContext): PatternLayer[] {
  // Mostly towards the name, so the thick side of each crescent faces it.
  const angle = ((180 + between(random, -70, 70)) * Math.PI) / 180;
  const drift = between(random, 0.22, 0.4);
  const discs = [focus.r + 16 * k, focus.r * between(random, 2.1, 2.4), focus.r * between(random, 3.1, 3.6)];
  return discs.map((r, i) => {
    const offset = (r - focus.r) * drift * (0.6 + i * 0.3);
    return {
      d: circle(focus.x + Math.cos(angle) * offset, focus.y + Math.sin(angle) * offset, r),
      mode: "fill" as const,
      width: 0,
      opacity: 0.17,
    };
  });
}

/** Halftone dots, biggest around the avatar, fading out towards the name. */
function trama({ box, focus, random, k }: MotifContext): PatternLayer[] {
  const pitch = between(random, 5.2, 6.4) * k;
  const angle = (pick(random, [0, 15, 30, 45]) * Math.PI) / 180;
  const maxDot = pitch * 0.38;
  // Dot centers stay out of the avatar, its frame and a little air around it.
  const clear = focus.r + 7 * k + maxDot;
  const falloff = reachOf(box, focus) * between(random, 0.45, 0.62);
  const buckets = 9;
  const dots: string[][] = Array.from({ length: buckets }, () => []);

  const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
  const cx = box.width / 2;
  const cy = box.height / 2;
  const n = Math.ceil(Math.hypot(box.width, box.height) / 2 / pitch) + 1;
  for (let i = -n; i <= n; i += 1) {
    for (let j = -n; j <= n; j += 1) {
      const x = cx + (i * ux - j * uy) * pitch;
      const y = cy + (i * uy + j * ux) * pitch;
      if (x < -pitch || x > box.width + pitch || y < -pitch || y > box.height + pitch) continue;
      const distance = Math.hypot(x - focus.x, y - focus.y);
      const t = 1 - (distance - clear) / falloff;
      if (distance < clear || t <= 0) continue;
      const size = t ** 1.4;
      if (size * maxDot < 0.3 * k) continue;
      dots[Math.min(buckets - 1, Math.floor(size * buckets))]!.push(`M${num(x)} ${num(y)}h.01`);
    }
  }
  return dots.flatMap((group, b) =>
    group.length === 0
      ? []
      : [{ d: group.join(""), mode: "stroke" as const, width: (2 * maxDot * (b + 1)) / buckets, opacity: 0.72, cap: "round" as const }],
  );
}

/**
 * A ribbon of fine strands, like a signature flourish: it runs low under the
 * name, rises behind the avatar and leaves through the top edge, twisting.
 */
function cinta({ box, focus, random, k }: MotifContext): PatternLayer[] {
  const { width: w, height: h } = box;
  const low = Math.min(h, focus.y + focus.r * 1.5);
  const p0: Point = [-20 * k, low - between(random, 0, 0.12) * h];
  const p1: Point = [focus.x * between(random, 0.86, 1), low + between(random, 0.05, 0.25) * h];
  const p2: Point = [focus.x + focus.r * between(random, -0.3, 0.3), focus.y - focus.r * between(random, 0.9, 1.7)];
  const p3: Point = [focus.x + (w - focus.x) * between(random, 0.55, 1), -30 * k];
  const strands = 21;
  const half = between(random, 10, 14) * k;
  const twists = between(random, 1.2, 2.2);
  const phase = between(random, 0, TAU);
  const steps = 220;

  const paths: string[] = [];
  for (let j = 0; j < strands; j += 1) {
    const lane = (j / (strands - 1)) * 2 - 1;
    const points: Point[] = [];
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const u = 1 - t;
      const x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0];
      const y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1];
      const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
      const dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
      const length = Math.hypot(dx, dy) || 1;
      const offset = lane * half * Math.cos(Math.PI * twists * t + phase);
      points.push([x - (dy / length) * offset, y + (dx / length) * offset]);
    }
    paths.push(visiblePath(points, box, false, 4));
  }
  return [{ d: paths.join(""), mode: "stroke", width: 0.45 * k, opacity: 0.75 }];
}

/** Fine rays leaving the avatar, long and short, like an engraved sun. */
function rayos({ box, focus, random, k }: MotifContext): PatternLayer[] {
  const count = pick(random, [48, 56, 64, 72]);
  const rotation = between(random, 0, TAU / count);
  const start = focus.r + 9 * k;
  const reach = reachOf(box, focus) + 4;
  const long: string[] = [];
  const short: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = rotation + (i / count) * TAU;
    const inner = i % 2 === 0 ? start : start + 10 * k;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    (i % 2 === 0 ? long : short).push(
      `M${num(focus.x + c * inner)} ${num(focus.y + s * inner)}L${num(focus.x + c * reach)} ${num(focus.y + s * reach)}`,
    );
  }
  return [
    { d: long.join(""), mode: "stroke", width: 0.55 * k, opacity: 0.6 },
    { d: short.join(""), mode: "stroke", width: 0.4 * k, opacity: 0.45 },
  ];
}

/**
 * Motif for a card. `seed` is the card's stored pattern seed, so the artwork
 * stays put while the owner edits their name or links. The monogram is a
 * letter, drawn by <PassArt>; it has no path layers.
 */
export function patternLayers(kind: PatternKind, seed: number | string, box: PatternBox, focus: PatternFocus): PatternLayer[] {
  const context: MotifContext = { box, focus, random: rng(hashSeed(`${kind}:${seed}`)), k: Math.max(0.75, focus.r / 38) };
  switch (kind) {
    case "orbitas":
      return orbitas(context);
    case "relieve":
      return relieve(context);
    case "halo":
      return halo(context);
    case "trama":
      return trama(context);
    case "cinta":
      return cinta(context);
    case "rayos":
      return rayos(context);
    case "monograma":
    case "liso":
      return [];
  }
}
