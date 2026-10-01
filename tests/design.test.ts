import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { editorialLines, HERO_BOX, monogram } from "@/components/card/pass-art";
import { contrastRatio, parseHex } from "@/lib/card/colors";
import { DEMO_CARD } from "@/lib/card/demo";
import {
  CARD_THEMES,
  designVersion,
  isPatternSeed,
  isTypeface,
  PATTERN_SEED_MAX,
  randomPatternSeed,
  resolveDesign,
  themeDesign,
  themeFor,
  TYPEFACES,
} from "@/lib/card/design";
import {
  fadesUnderText,
  hashSeed,
  hasVariations,
  isPatternKind,
  PATTERN_KINDS,
  patternLayers,
  toPatternKind,
  type PatternLayer,
} from "@/lib/card/pattern";
import { toPublicCard } from "@/lib/data/cards";
import { artVersion, heroImage, stripImages } from "@/lib/pass/art";

const BOX = { width: 375, height: 144 };
const FOCUS = { x: 301, y: 72, r: 38 };
const HERO_FOCUS = { x: 187.5, y: 61, r: 21 };
/** Gap between the photo and its hairline frame in PassArt. */
const FRAME_GAP = 4.5;

/** Absolute vertices of the path commands the generator emits (M, L, V, l, h, a, z). */
function vertices(d: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let x = 0;
  let y = 0;
  for (const [, command, args] of d.matchAll(/([MLVlhaz])([^MLVlhaz]*)/g)) {
    const n = (args!.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
    if (command === "M" || command === "L") [x, y] = [n[0]!, n[1]!];
    if (command === "h") x += n[0]!;
    if (command === "V") y = n[0]!;
    if (command === "a") [x, y] = [x + n[5]!, y + n[6]!];
    if (command === "l") {
      for (let i = 0; i + 1 < n.length; i += 2) {
        x += n[i]!;
        y += n[i + 1]!;
        points.push([x, y]);
      }
      continue;
    }
    if (command !== "z") points.push([x, y]);
  }
  return points;
}

const seeded = PATTERN_KINDS.filter(hasVariations);

describe("patternLayers", () => {
  it("is deterministic per seed and differs between seeds", () => {
    for (const kind of seeded) {
      const a = patternLayers(kind, 48213, BOX, FOCUS);
      expect(patternLayers(kind, 48213, BOX, FOCUS), kind).toEqual(a);
      expect(patternLayers(kind, 48214, BOX, FOCUS), kind).not.toEqual(a);
    }
  });

  it("draws no paths for the plain style and the monogram (a letter, drawn by PassArt)", () => {
    expect(patternLayers("liso", 1, BOX, FOCUS)).toEqual([]);
    expect(patternLayers("monograma", 1, BOX, FOCUS)).toEqual([]);
    expect(PATTERN_KINDS.filter((k) => !hasVariations(k))).toEqual(["monograma", "liso"]);
  });

  it("emits compact, well-formed path data", () => {
    for (const kind of PATTERN_KINDS) {
      const layers = patternLayers(kind, 7, BOX, FOCUS);
      const size = layers.reduce((total, layer) => total + layer.d.length, 0);
      // Drawn in the browser for every preview (the editor shows all motifs at once).
      expect(size, kind).toBeLessThan(64 * 1024);
      for (const layer of layers) {
        expect(layer.d, kind).toMatch(/^M-?[\d.]+ -?[\d.]+/);
        expect(layer.d, kind).not.toMatch(/NaN|Infinity/);
        expect(layer.opacity).toBeGreaterThan(0);
        expect(layer.opacity).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps lines off the photo's frame (tints and the ribbon pass behind it on purpose)", () => {
    for (const [box, focus] of [
      [BOX, FOCUS],
      [HERO_BOX, HERO_FOCUS],
    ] as const) {
      for (const kind of ["arco", "corriente"] as const) {
        for (let seed = 0; seed < 60; seed += 1) {
          const nearest = Math.min(
            ...patternLayers(kind, seed, box, focus)
              .filter((layer: PatternLayer) => layer.mode === "stroke")
              .flatMap((layer) => vertices(layer.d).map(([x, y]) => Math.hypot(x - focus.x, y - focus.y))),
          );
          expect(nearest, `${kind} #${seed} (r=${focus.r})`).toBeGreaterThan(focus.r + FRAME_GAP + 0.5);
        }
      }
    }
  });

  it("never draws a hairline through the name", () => {
    // The name column ends 14 pt short of the photo's frame (see PassArt); it spans y 14…130.
    const nameEdge = FOCUS.x - FOCUS.r - FRAME_GAP - 14;
    for (let seed = 0; seed < 60; seed += 1) {
      for (const [x, y] of patternLayers("arco", seed, BOX, FOCUS)
        .filter((layer) => layer.mode === "stroke")
        .flatMap((layer) => vertices(layer.d))) {
        expect(x, `arco #${seed} at y=${y}`).toBeGreaterThanOrEqual(nameEdge);
      }
      const [creases] = patternLayers("pliegue", seed, BOX, FOCUS).filter((layer) => layer.mode === "stroke");
      const ends = vertices(creases!.d);
      for (let i = 0; i + 1 < ends.length; i += 2) {
        const [[x1, y1], [x2, y2]] = [ends[i]!, ends[i + 1]!];
        for (const y of [14, 130]) {
          const x = x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
          expect(x, `pliegue #${seed} at y=${y}`).toBeGreaterThan(nameEdge);
        }
        // Each crease runs right behind the photo or clears its frame.
        const distance = Math.abs((x2 - x1) * (y1 - FOCUS.y) - (x1 - FOCUS.x) * (y2 - y1)) / Math.hypot(x2 - x1, y2 - y1);
        expect(distance < FOCUS.r * 0.6 || distance > FOCUS.r + FRAME_GAP + 4, `pliegue #${seed}: ${distance}`).toBe(true);
      }
    }
  });

  it("draws every motif in the Google hero and the large brand boxes", () => {
    const boxes = [
      [HERO_BOX, HERO_FOCUS],
      [{ width: 1100, height: 760 }, { x: 550, y: 380, r: 106.4 }],
    ] as const;
    for (const [box, focus] of boxes) {
      for (const kind of seeded) {
        const layers = patternLayers(kind, 2026, box, focus);
        expect(layers.length, kind).toBeGreaterThan(0);
        for (const layer of layers) expect(layer.d, kind).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it("only draws what can be seen", () => {
    for (const kind of ["corriente", "cinta"] as const) {
      for (const [x, y] of patternLayers(kind, 11, BOX, FOCUS).flatMap((layer) => vertices(layer.d))) {
        expect(x, kind).toBeGreaterThan(-60);
        expect(x, kind).toBeLessThan(BOX.width + 60);
        expect(y, kind).toBeGreaterThan(-60);
        expect(y, kind).toBeLessThan(BOX.height + 60);
      }
    }
  });

  it("validates kinds, maps retired ones and hashes seeds stably", () => {
    expect(isPatternKind("arco")).toBe(true);
    expect(isPatternKind("orbitas")).toBe(false);
    expect(toPatternKind("corriente")).toBe("corriente");
    expect(toPatternKind("orbitas")).toBe("arco");
    expect(toPatternKind("relieve")).toBe("corriente");
    expect(toPatternKind("trama")).toBe("halo");
    expect(toPatternKind("rayos")).toBe("persiana");
    expect(toPatternKind("sello")).toBe("arco");
    expect(toPatternKind("senal")).toBe("arco");
    expect(toPatternKind("ondas")).toBe("cinta");
    expect(toPatternKind("tartan")).toBeNull();
    expect(toPatternKind(undefined)).toBeNull();
    expect(fadesUnderText("halo")).toBe(false);
    for (const kind of ["arco", "persiana", "pliegue", "halo"] as const) expect(fadesUnderText(kind), kind).toBe(false);
    expect(fadesUnderText("corriente")).toBe(true);
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
  });
});

describe("design model", () => {
  it("ships themes whose detail ink is used as-is and stays visible", () => {
    const ids = new Set<string>();
    for (const theme of CARD_THEMES) {
      ids.add(theme.id);
      const design = resolveDesign(themeDesign(theme.id, "arco", 1));
      expect(design.detail, theme.name).toBe(theme.detail);
      // Soft, pastel pairs: visible (≥ 2:1) but never harsh.
      expect(contrastRatio(parseHex(theme.background)!, parseHex(theme.detail)!), theme.name).toBeGreaterThanOrEqual(2);
    }
    expect(ids.size).toBe(CARD_THEMES.length);
  });

  it("uses the theme's own detail when the owner picks 'automático' on a theme background", () => {
    const design = resolveDesign({ ...themeDesign("cafe", "cinta", 5), accentColor: "#3e2c23", detailColor: null });
    expect(design.detail).toBe("#F0A574");
  });

  it("derives a tonal detail for custom backgrounds and replaces invisible picks", () => {
    const base = themeDesign("naranja", "arco", 5);
    const auto = resolveDesign({ ...base, accentColor: "#335577", detailColor: null });
    expect(contrastRatio(parseHex(auto.detail)!, parseHex("#335577")!)).toBeGreaterThanOrEqual(3);

    const invisible = resolveDesign({ ...base, accentColor: "#335577", detailColor: "#335578" });
    expect(invisible.detail).toBe(auto.detail);
  });

  it("validates variation seeds and typefaces", () => {
    expect(isPatternSeed(PATTERN_SEED_MAX)).toBe(true);
    expect(isPatternSeed(PATTERN_SEED_MAX + 1)).toBe(false);
    expect(isPatternSeed(-1)).toBe(false);
    expect(isPatternSeed(1.5)).toBe(false);
    for (let i = 0; i < 50; i += 1) expect(isPatternSeed(randomPatternSeed())).toBe(true);
    expect(TYPEFACES.every(isTypeface)).toBe(true);
    expect(isTypeface("comic")).toBe(false);
  });

  it("finds themes and builds showcase designs", () => {
    expect(themeFor("#ef7a4a", "#ffe3d1")?.id).toBe("naranja");
    expect(themeFor("#EF7A4A", "#FFFFFF")).toBeUndefined();
    expect(themeDesign("terracota", "cinta", 9, "cursiva")).toEqual({
      accentColor: "#B5532E",
      detailColor: "#F8D3BD",
      pattern: "cinta",
      patternSeed: 9,
      typeface: "cursiva",
    });
    expect(themeDesign("nope").accentColor).toBe(CARD_THEMES[0]!.background);
    expect(themeDesign("nope").typeface).toBe("clasica");
  });

  it("splits names for the editorial typeface and picks the monogram letter", () => {
    expect(editorialLines("  Lucía Ferrer Catalán ")).toEqual(["Lucía", "Ferrer Catalán"]);
    expect(editorialLines("Cher")).toEqual(["Cher", ""]);
    expect(monogram("álex rivera", 38).letter).toBe("Á");
    // Same proportions at any avatar size.
    expect(monogram("A", 76).size).toBeCloseTo(monogram("A", 38).size * 2);
  });

  it("versions artwork by its inputs only", () => {
    expect(designVersion(["a", 1])).toBe(designVersion(["a", 1]));
    expect(designVersion(["a", 1])).not.toBe(designVersion(["a", 2]));
    const card = toPublicCard(DEMO_CARD);
    expect(artVersion({ ...card, bio: "otra bio" }, "strip")).toBe(artVersion(card, "strip"));
    expect(artVersion({ ...card, fullName: "Otra" }, "strip")).not.toBe(artVersion(card, "strip"));
    expect(artVersion({ ...card, typeface: "moderna" }, "strip")).not.toBe(artVersion(card, "strip"));
    // The hero has no name: renaming or changing the typeface doesn't bust Google's image cache…
    expect(artVersion({ ...card, fullName: "Otra" }, "hero")).toBe(artVersion(card, "hero"));
    expect(artVersion({ ...card, typeface: "moderna" }, "hero")).toBe(artVersion(card, "hero"));
    expect(artVersion({ ...card, patternSeed: 1 }, "hero")).not.toBe(artVersion(card, "hero"));
    // …except for the monogram, which draws the initial.
    const monogramCard = { ...card, pattern: "monograma" as const };
    expect(artVersion({ ...monogramCard, fullName: "Otra" }, "hero")).not.toBe(artVersion(monogramCard, "hero"));
  });
});

describe("artwork rendering", () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://passme.test");
  const card = toPublicCard(DEMO_CARD);

  it("renders the Apple strip at 1x/2x/3x in the card's background color", async () => {
    const images = await stripImages({ ...card, pattern: "liso" }, null);
    expect(Object.keys(images).sort()).toEqual(["strip.png", "strip@2x.png", "strip@3x.png"]);
    const meta = await sharp(images["strip@3x.png"]!).metadata();
    expect([meta.width, meta.height]).toEqual([1125, 432]);

    // Top-left corner is plain background (#EF7A4A).
    const { data } = await sharp(images["strip.png"]!).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([239, 122, 74]);
  }, 30_000);

  it("renders every motif and typeface", async () => {
    const renders = new Set<string>();
    for (const pattern of PATTERN_KINDS) {
      const images = await stripImages({ ...card, pattern }, null);
      renders.add(images["strip.png"]!.toString("base64"));
    }
    for (const typeface of TYPEFACES) {
      const images = await stripImages({ ...card, pattern: "liso", typeface }, null);
      renders.add(images["strip.png"]!.toString("base64"));
    }
    // 8 motifs + 3 typefaces other than "clasica" on the plain style (already counted).
    expect(renders.size).toBe(PATTERN_KINDS.length + TYPEFACES.length - 1);
  }, 60_000);

  it("renders the Google hero at 1032×336 and memoizes it", async () => {
    const first = await heroImage(card);
    const meta = await sharp(first).metadata();
    expect([meta.width, meta.height]).toEqual([1032, 336]);
    expect(await heroImage(card)).toBe(first);
  }, 30_000);

  it("embeds the avatar into the strip", async () => {
    const avatar = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 10, g: 200, b: 90 } } })
      .jpeg()
      .toBuffer();
    const images = await stripImages({ ...card, avatarUrl: "https://example.com/a.jpg" }, avatar);
    // Center of the avatar (301, 72 pt) at 3x.
    const { data } = await sharp(images["strip@3x.png"]!).extract({ left: 903, top: 216, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(data[1]).toBeGreaterThan(150);
    expect(data[0]).toBeLessThan(80);
  }, 30_000);
});
