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

export const PATTERN_KINDS = ["arco", "corriente", "persiana", "pliegue", "halo", "cinta", "monograma", "liso"] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

export const DEFAULT_PATTERN: PatternKind = "arco";

export const PATTERN_LABELS: Record<PatternKind, { name: string; description: string }> = {
  arco: { name: "Arco", description: "Un arco que enmarca tu foto, como un retrato en su hornacina." },
  corriente: { name: "Corriente", description: "Líneas finas que se abren a tu paso, como el agua al pasar una piedra." },
  persiana: { name: "Persiana", description: "La luz de la tarde entrando por una persiana." },
  pliegue: { name: "Pliegue", description: "La tarjeta doblada como una carta, con la sombra suave del papel." },
  halo: { name: "Halo", description: "Círculos de color que se superponen detrás de tu foto." },
  cinta: { name: "Cinta", description: "Una cinta de líneas que se retuerce detrás de tu foto." },
  monograma: { name: "Monograma", description: "Tu inicial en cursiva, enorme, como un sello de papelería." },
  liso: { name: "Liso", description: "Solo color. Para los minimalistas." },
};

/** Retired motifs (2026-09 and 2026-10 redesigns), read as their closest successor. */
const LEGACY_PATTERNS: Readonly<Record<string, PatternKind>> = {
  sello: "arco",
  senal: "arco",
  ondas: "cinta",
  orbitas: "arco",
  relieve: "corriente",
  trama: "halo",
  rayos: "persiana",
};

export function isPatternKind(value: unknown): value is PatternKind {
  return typeof value === "string" && (PATTERN_KINDS as readonly string[]).includes(value);
}

/** Motifs drawn from the card's seed (the letter and the plain style look the same every time). */
export function hasVariations(kind: PatternKind): boolean {
  return kind !== "monograma" && kind !== "liso";
}

/** Line motifs fade out under the name; a fade across flat tints reads as a smudge. */
export function fadesUnderText(kind: PatternKind): boolean {
  return kind === "corriente" || kind === "cinta";
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

// --- Motifs ------------------------------------------------------------------

interface MotifContext {
  box: PatternBox;
  focus: PatternFocus;
  random: Random;
  /** Motif scale: 1 on the Apple strip, where the avatar radius is 38 pt. */
  k: number;
}

/** PassArt draws the photo's hairline frame 4.5 pt out; lines keep off it. */
const FRAME_CLEARANCE = 5;
/** The name column stops 14 pt short of that frame: hairlines left of the photo stay out of it. */
const NAME_CLEARANCE = 18.5;

/** Closed arch: straight jambs from `bottom` up to the springing line, a half circle on top. */
function archPath(cx: number, cy: number, half: number, bottom: number): string {
  return `M${num(cx - half)} ${num(bottom)}V${num(cy)}a${num(half)} ${num(half)} 0 0 1 ${num(half * 2)} 0V${num(bottom)}z`;
}

/** Open arch outline (no floor line). */
function archLine(cx: number, cy: number, half: number, bottom: number): string {
  return `M${num(cx - half)} ${num(bottom)}V${num(cy)}a${num(half)} ${num(half)} 0 0 1 ${num(half * 2)} 0V${num(bottom)}`;
}

/** An arched niche around the portrait, as in a Renaissance painting. */
function arco({ box, focus, random, k }: MotifContext): PatternLayer[] {
  // Mostly tinted niches; now and then just the outline.
  const roll = random();
  const style = roll < 0.45 ? "nicho" : roll < 0.85 ? "doble" : "linea";
  const lift = focus.r * between(random, 0, 0.22);
  const cy = focus.y - lift;
  const half = focus.r + lift + between(random, 9, 15) * k;
  const gap = between(random, 4, 6) * k;
  const bottom = box.height + 4;
  const layers: PatternLayer[] = [];
  if (style === "doble") {
    const outer = half * between(random, 1.45, 1.65);
    layers.push({ d: archPath(focus.x, cy - (outer - half) * 0.15, outer, bottom), mode: "fill", width: 0, opacity: 0.12 });
  }
  if (style !== "linea") layers.push({ d: archPath(focus.x, cy, half, bottom), mode: "fill", width: 0, opacity: 0.17 });

  // A hairline just outside the niche, or a moulding inside it when outside would cut into the name.
  const widest = focus.r + NAME_CLEARANCE;
  const narrowest = focus.r + lift + FRAME_CLEARANCE + 2.5 * k;
  let lines = style === "linea" ? [half, half + gap] : [half + gap];
  if (lines.at(-1)! > widest) lines = style === "linea" ? lines.map((h) => h - (lines.at(-1)! - widest)) : [half - gap];
  lines
    .filter((h) => h >= narrowest)
    .forEach((h, i) => layers.push({ d: archLine(focus.x, cy, h, bottom), mode: "stroke", width: 0.6 * k, opacity: 0.7 - i * 0.15 }));
  return layers;
}

/** Stream function of a uniform flow past a cylinder of radius `a`. */
function streamY(x: number, c: number, a: number): number {
  const sign = c < 0 ? -1 : 1;
  const target = Math.abs(c);
  let lo = x * x < a * a ? Math.sqrt(a * a - x * x) : 0;
  let hi = target + a;
  for (let i = 0; i < 32; i += 1) {
    const y = (lo + hi) / 2;
    const psi = y * (1 - (a * a) / (x * x + y * y || 1e-9));
    if (psi < target) lo = y;
    else hi = y;
  }
  return sign * (lo + hi) / 2;
}

/** Fine lines that flow in from the edge and part around the portrait, like water past a stone. */
function corriente({ box, focus, random, k }: MotifContext): PatternLayer[] {
  const a = focus.r + FRAME_CLEARANCE + between(random, 2, 4) * k;
  const tilt = between(random, -0.2, 0.2);
  const spacing = between(random, 5, 6.2) * k;
  const lanes = intBetween(random, 4, 6);
  const swell = between(random, 0, 3) * k;
  const wavelength = between(random, 140, 220) * k;
  const phase = between(random, 0, TAU);
  const reach = reachOf(box, focus) + 10;
  const [cos, sin] = [Math.cos(tilt), Math.sin(tilt)];
  const paths: string[] = [];
  for (let j = -lanes; j <= lanes; j += 1) {
    if (j === 0) continue;
    const c = (j - Math.sign(j) * 0.5) * spacing;
    const points: Point[] = [];
    for (let x = -reach; x <= reach; x += 3) {
      // The swell dies out near the stone, so it never pushes a line onto the frame.
      const calm = Math.min(1, Math.max(0, Math.abs(x) / a - 1.5) / 1.5);
      const y = streamY(x, c, a) + swell * Math.sin((x / wavelength) * TAU + phase) * calm;
      points.push([focus.x + x * cos - y * sin, focus.y + x * sin + y * cos]);
    }
    paths.push(visiblePath(points, box, false, 4));
  }
  return [{ d: paths.join(""), mode: "stroke", width: 0.5 * k, opacity: 0.75 }];
}

/**
 * Points on a line through `origin` at `angle`: `along` the line, `across`
 * it (positive to its right). Long fills can then be drawn as plain quads.
 */
function lineFrame(origin: Point, angle: number): (along: number, across: number) => Point {
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  return (along, across) => [origin[0] + dx * along + dy * across, origin[1] + dy * along - dx * across];
}

/**
 * The card folded like a letter: the main crease runs right behind the
 * portrait, now and then a second one near the edge, and the paper shades
 * softly away from each fold. No crease ever crosses the name.
 */
function pliegue({ box, focus, random, k }: MotifContext): PatternLayer[] {
  const angle = between(random, 0.36, 0.44) * Math.PI;
  const sine = Math.sin(angle);
  // Across-distances are measured along the crease normal (to its right), from the main crease.
  const origin: Point = [focus.x + focus.r * between(random, -0.3, 0.3), focus.y];
  const at = lineFrame(origin, angle);
  const length = reachOf(box, focus) * 2;
  const band = (from: number, to: number) => polyline([at(-length, from), at(length, from), at(length, to), at(-length, to)], true);
  const creases = [0];
  // The second crease clears the photo's frame wherever the main one sits behind it.
  if (random() < 0.5) creases.push(focus.r * 1.3 + between(random, 10, 16) * k);
  // Shade towards the name (most cards) or towards the edge.
  const side = random() < 0.7 ? -1 : 1;
  const far = (box.width + length) / sine;
  const fadeOver = focus.r * 3;
  const steps = 6;

  const layers: PatternLayer[] = [];
  const panels = side < 0 ? [{ from: 0, to: -far, peak: 0.16 }] : [];
  creases.forEach((from, i) => {
    if (side > 0 || i > 0) panels.push({ from, to: creases[i + 1] ?? far, peak: i === 0 ? 0.16 : 0.1 });
  });
  for (const { from, to, peak } of panels) {
    const direction = Math.sign(to - from);
    const ramp = Math.min(Math.abs(to - from), fadeOver);
    // A few strips over the ramp (none overlap, so no pixel is blended twice), then one flat tail.
    for (let i = 0; i < steps; i += 1) {
      const shade = peak * (1 - 0.7 * (i / steps) ** 0.8);
      layers.push({ d: band(from + (direction * ramp * i) / steps, from + (direction * ramp * (i + 1)) / steps), mode: "fill", width: 0, opacity: shade });
    }
    if (Math.abs(to - from) > ramp) layers.push({ d: band(from + direction * ramp, to), mode: "fill", width: 0, opacity: peak * 0.3 });
  }
  const lines = creases.map((across) => polyline([at(-length, across), at(length, across)], false));
  layers.push({ d: lines.join(""), mode: "stroke", width: 0.55 * k, opacity: 0.5 });
  return layers;
}

/**
 * Late-afternoon light through a window blind: a few slanted slats of light
 * falling across the portrait, widening with the perspective.
 */
function persiana({ box, focus, random, k }: MotifContext): PatternLayer[] {
  const angle = -between(random, 0.15, 0.22) * Math.PI;
  const slats = intBetween(random, 5, 7);
  const slat = between(random, 8, 11) * k;
  const gap = between(random, 5, 7) * k;
  const spread = between(random, 0.06, 0.12);
  const soft = 2 * k;
  const scales = Array.from({ length: slats }, (_, i) => 1 + spread * (i - (slats - 1) / 2));
  const total = scales.reduce((sum, scale, i) => sum + slat * scale + (i < slats - 1 ? gap * scale : 0), 0);
  // The patch of light is centered on the portrait; its near end is slanted like a window jamb.
  const center: Point = [focus.x + focus.r * between(random, -0.4, 0.2), focus.y + focus.r * between(random, -0.25, 0.25)];
  const near = -focus.r * between(random, 2.8, 3.4);
  const jamb = between(random, 0.5, 0.9);
  const far = reachOf(box, focus) * 2;
  // Across the slats runs down and to the right, away from the light.
  const toRight = lineFrame(center, angle);
  const at = (along: number, across: number) => toRight(along, -across);
  const slatPath = (from: number, to: number, inset: number) =>
    polyline([at(near + from * jamb + inset, from), at(far, from), at(far, to), at(near + to * jamb + inset, to)], true);

  const layers: PatternLayer[] = [];
  let offset = -total / 2;
  for (const scale of scales) {
    const width = slat * scale;
    // Two nested slats: the outer one is the soft penumbra of the light.
    layers.push({ d: slatPath(offset, offset + width, 0), mode: "fill", width: 0, opacity: 0.08 });
    layers.push({ d: slatPath(offset + soft, offset + width - soft, soft), mode: "fill", width: 0, opacity: 0.1 });
    offset += width + gap * scale;
  }
  return layers;
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

/**
 * Motif for a card. `seed` is the card's stored pattern seed, so the artwork
 * stays put while the owner edits their name or links. The monogram is a
 * letter, drawn by <PassArt>; it has no path layers.
 */
export function patternLayers(kind: PatternKind, seed: number | string, box: PatternBox, focus: PatternFocus): PatternLayer[] {
  const context: MotifContext = { box, focus, random: rng(hashSeed(`${kind}:${seed}`)), k: Math.max(0.75, focus.r / 38) };
  switch (kind) {
    case "arco":
      return arco(context);
    case "corriente":
      return corriente(context);
    case "persiana":
      return persiana(context);
    case "pliegue":
      return pliegue(context);
    case "halo":
      return halo(context);
    case "cinta":
      return cinta(context);
    case "monograma":
    case "liso":
      return [];
  }
}
