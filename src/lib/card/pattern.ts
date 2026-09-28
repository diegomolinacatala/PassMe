/**
 * Generative "security print" motifs for the pass artwork.
 *
 * Every card gets its own variation: a stored random seed drives a tiny PRNG,
 * so the same card always draws the same rosette while two people (almost)
 * never share one. The
 * output is plain SVG path data, rendered identically by the browser (editor
 * preview, public page) and by Satori/resvg on the server (wallet images).
 *
 * Pure and dependency-free on purpose: imported by client and server code.
 */

export const PATTERN_KINDS = ["sello", "ondas", "senal", "liso"] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

export const DEFAULT_PATTERN: PatternKind = "sello";

export const PATTERN_LABELS: Record<PatternKind, { name: string; description: string }> = {
  sello: { name: "Sello", description: "Un rosetón de guilloché único, como el de un pasaporte." },
  ondas: { name: "Ondas", description: "Líneas entrelazadas de billete de banco." },
  senal: { name: "Señal", description: "Anillos que salen de tu foto, como un pago sin contacto." },
  liso: { name: "Liso", description: "Solo color. Para los minimalistas." },
};

export function isPatternKind(value: unknown): value is PatternKind {
  return typeof value === "string" && (PATTERN_KINDS as readonly string[]).includes(value);
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

/** Where the seal sits (usually the avatar): center and radius of the clear zone. */
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

const between = (random: () => number, min: number, max: number) => min + (max - min) * random();
const intBetween = (random: () => number, min: number, max: number) => Math.floor(between(random, min, max + 1));

// --- Compact path encoding ---------------------------------------------------

/** Rounds to 1 decimal and drops the leading zero ("-0.4" → "-.4"). */
function num(n: number): string {
  const s = (Math.round(n * 10) / 10).toString();
  return s.replace(/^(-?)0\./, "$1.");
}

/** Polyline with relative moves: keeps paths small enough to inline in HTML. */
function polyline(points: ReadonlyArray<readonly [number, number]>, closed: boolean): string {
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

// --- Motifs ------------------------------------------------------------------

/** A closed polar curve around the focus. */
function polarCurve(focus: PatternFocus, steps: number, radius: (t: number) => number): string {
  const points: Array<[number, number]> = [];
  for (let s = 0; s < steps; s += 1) {
    const t = (s / steps) * Math.PI * 2;
    const r = radius(t);
    points.push([focus.x + r * Math.cos(t), focus.y + r * Math.sin(t)]);
  }
  return polyline(points, true);
}

/**
 * Guilloché rosette: concentric "rope" bands. Each band is a handful of wavy
 * rings with the same radius, each rotated a fraction of a petal, so they
 * braid into the lattice you see on passports and banknotes.
 */
function sello(box: PatternBox, focus: PatternFocus, random: () => number): PatternLayer[] {
  const reach = Math.max(box.height * 0.95, focus.r * 2.6);
  const inner = focus.r + 9;
  const petals = intBetween(random, 7, 12);
  const strands = 7;
  const bands = [
    { radius: inner + reach * 0.1, amp: reach * 0.05, petals: petals * 3, width: 0.4 },
    { radius: inner + reach * 0.34, amp: reach * 0.12, petals: petals * 2 + intBetween(random, 0, 1), width: 0.45 },
    { radius: inner + reach * 0.66, amp: reach * between(random, 0.15, 0.2), petals, width: 0.5 },
  ];
  const skew = between(random, 0.2, 0.45);

  const layers: PatternLayer[] = bands.map((band) => {
    // ~12 samples per petal, and never more than ~1.6 units per segment so big rings stay smooth.
    const steps = Math.min(480, Math.max(band.petals * 12, Math.ceil((Math.PI * 2 * band.radius) / 1.6)));
    const curves: string[] = [];
    for (let k = 0; k < strands; k += 1) {
      const phase = (k / strands) * ((Math.PI * 2) / band.petals);
      curves.push(
        polarCurve(focus, steps, (t) => {
          const wave = Math.sin(band.petals * (t + phase));
          // A little second harmonic makes the petals lean like engraved loops.
          return band.radius + band.amp * (wave + skew * Math.sin(2 * band.petals * (t + phase)));
        }),
      );
    }
    return { d: curves.join(""), mode: "stroke" as const, width: band.width, opacity: 0.85 };
  });

  // Scalloped seal edge just outside the avatar.
  const scallops = petals * 4;
  layers.push({
    d: polarCurve(focus, scallops * 6, (t) => focus.r + 4 + 1.2 * Math.abs(Math.sin((scallops * t) / 2))),
    mode: "stroke",
    width: 0.7,
    opacity: 0.95,
  });
  return layers;
}

/** Banknote waves: interlaced sine ribbons across the whole artwork. */
function ondas(box: PatternBox, _focus: PatternFocus, random: () => number): PatternLayer[] {
  const lines = 13;
  const wavelength = between(random, 46, 78);
  const drift = between(random, 0.28, 0.5);
  const swellLength = between(random, 180, 320);
  const swellPhase = between(random, 0, Math.PI * 2);
  const gap = box.height / (lines - 1);
  const amp = gap * between(random, 1.2, 1.8);
  const step = 2.5;

  const paths: string[] = [];
  for (const family of [1, -1]) {
    for (let j = -1; j <= lines; j += 1) {
      const y0 = j * gap;
      const phase = family * j * drift + (family < 0 ? Math.PI : 0);
      const points: Array<[number, number]> = [];
      for (let x = -step; x <= box.width + step; x += step) {
        const swell = 0.55 + 0.45 * Math.sin((2 * Math.PI * x) / swellLength + swellPhase);
        const y = y0 + amp * swell * Math.sin((2 * Math.PI * x) / wavelength + phase);
        points.push([x, y]);
      }
      paths.push(polyline(points, false));
    }
  }
  return [{ d: paths.join(""), mode: "stroke", width: 0.45, opacity: 0.7 }];
}

/** Contactless signal: concentric rings radiating from the avatar. */
function senal(box: PatternBox, focus: PatternFocus, random: () => number): PatternLayer[] {
  const gap = between(random, 5.5, 8);
  const maxR = Math.hypot(Math.max(focus.x, box.width - focus.x), Math.max(focus.y, box.height - focus.y));
  const layers: PatternLayer[] = [];
  const bands = [
    { until: 0.35, width: 1.3, opacity: 0.9 },
    { until: 0.65, width: 0.8, opacity: 0.7 },
    { until: 1.01, width: 0.45, opacity: 0.5 },
  ];
  let start = focus.r + 6;
  for (const band of bands) {
    const circles: string[] = [];
    for (let r = start; r <= maxR * band.until; r += gap) {
      // Two half arcs make a full circle in plain path syntax.
      circles.push(`M${num(focus.x - r)} ${num(focus.y)}a${num(r)} ${num(r)} 0 1 0 ${num(r * 2)} 0a${num(r)} ${num(r)} 0 1 0 ${num(-r * 2)} 0`);
      start = r + gap;
    }
    if (circles.length > 0) layers.push({ d: circles.join(""), mode: "stroke", width: band.width, opacity: band.opacity });
  }
  return layers;
}

/**
 * Pattern for a card. `seed` is the card's stored pattern seed, so the artwork
 * stays put while the owner edits their name or links.
 */
export function patternLayers(kind: PatternKind, seed: number | string, box: PatternBox, focus: PatternFocus): PatternLayer[] {
  const random = rng(hashSeed(`${kind}:${seed}`));
  switch (kind) {
    case "sello":
      return sello(box, focus, random);
    case "ondas":
      return ondas(box, focus, random);
    case "senal":
      return senal(box, focus, random);
    case "liso":
      return [];
  }
}
