import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { contrastRatio, parseHex } from "@/lib/card/colors";
import { DEMO_CARD } from "@/lib/card/demo";
import {
  CARD_THEMES,
  designVersion,
  isPatternSeed,
  PATTERN_SEED_MAX,
  randomPatternSeed,
  resolveDesign,
  sealNumber,
  themeDesign,
  themeFor,
} from "@/lib/card/design";
import { hashSeed, isPatternKind, PATTERN_KINDS, patternLayers } from "@/lib/card/pattern";
import { toPublicCard } from "@/lib/data/cards";
import { artVersion, heroImage, stripImages } from "@/lib/pass/art";

const BOX = { width: 375, height: 144 };
const FOCUS = { x: 301, y: 72, r: 38 };

describe("patternLayers", () => {
  it("is deterministic per seed and differs between seeds", () => {
    for (const kind of ["sello", "ondas", "senal"] as const) {
      const a = patternLayers(kind, 48213, BOX, FOCUS);
      expect(patternLayers(kind, 48213, BOX, FOCUS), kind).toEqual(a);
      expect(patternLayers(kind, 48214, BOX, FOCUS), kind).not.toEqual(a);
    }
  });

  it("draws nothing for the plain style", () => {
    expect(patternLayers("liso", 1, BOX, FOCUS)).toEqual([]);
  });

  it("emits compact, well-formed path data", () => {
    for (const kind of PATTERN_KINDS) {
      const layers = patternLayers(kind, 7, BOX, FOCUS);
      const size = layers.reduce((total, layer) => total + layer.d.length, 0);
      // Inlined in HTML for every preview: keep each artwork well under 64 KB.
      expect(size, kind).toBeLessThan(64 * 1024);
      for (const layer of layers) {
        expect(layer.d, kind).toMatch(/^M-?[\d.]+ -?[\d.]+/);
        expect(layer.d, kind).not.toMatch(/NaN|Infinity/);
        expect(layer.opacity).toBeGreaterThan(0);
        expect(layer.opacity).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps the seal ring clear of the avatar", () => {
    const [firstBand] = patternLayers("sello", 3, BOX, FOCUS);
    const points = [...firstBand!.d.matchAll(/^M(-?[\d.]+) (-?[\d.]+)/g)];
    const [, x, y] = points[0]!;
    expect(Math.hypot(Number(x) - FOCUS.x, Number(y) - FOCUS.y)).toBeGreaterThan(FOCUS.r);
  });

  it("validates kinds and hashes seeds stably", () => {
    expect(isPatternKind("sello")).toBe(true);
    expect(isPatternKind("tartan")).toBe(false);
    expect(isPatternKind(undefined)).toBe(false);
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
  });
});

describe("design model", () => {
  it("ships themes whose detail ink is used as-is and stays visible", () => {
    const ids = new Set<string>();
    for (const theme of CARD_THEMES) {
      ids.add(theme.id);
      const design = resolveDesign({ accentColor: theme.background, detailColor: theme.detail, pattern: "sello", patternSeed: 1 });
      expect(design.detail, theme.name).toBe(theme.detail);
      // Soft, pastel pairs: visible (≥ 2:1) but never harsh.
      expect(contrastRatio(parseHex(theme.background)!, parseHex(theme.detail)!), theme.name).toBeGreaterThanOrEqual(2);
    }
    expect(ids.size).toBe(CARD_THEMES.length);
  });

  it("uses the theme's own detail when the owner picks 'automático' on a theme background", () => {
    const design = resolveDesign({ accentColor: "#3e2c23", detailColor: null, pattern: "ondas", patternSeed: 5 });
    expect(design.detail).toBe("#F0A574");
  });

  it("derives a tonal detail for custom backgrounds and replaces invisible picks", () => {
    const auto = resolveDesign({ accentColor: "#335577", detailColor: null, pattern: "sello", patternSeed: 5 });
    expect(contrastRatio(parseHex(auto.detail)!, parseHex("#335577")!)).toBeGreaterThanOrEqual(3);

    const invisible = resolveDesign({ accentColor: "#335577", detailColor: "#335578", pattern: "sello", patternSeed: 5 });
    expect(invisible.detail).toBe(auto.detail);
  });

  it("formats and validates seal numbers", () => {
    expect(sealNumber(48213)).toBe("Nº 048213");
    expect(sealNumber(0)).toBe("Nº 000000");
    expect(isPatternSeed(PATTERN_SEED_MAX)).toBe(true);
    expect(isPatternSeed(PATTERN_SEED_MAX + 1)).toBe(false);
    expect(isPatternSeed(-1)).toBe(false);
    expect(isPatternSeed(1.5)).toBe(false);
    for (let i = 0; i < 50; i += 1) expect(isPatternSeed(randomPatternSeed())).toBe(true);
  });

  it("finds themes and builds showcase designs", () => {
    expect(themeFor("#ef7a4a", "#ffe3d1")?.id).toBe("naranja");
    expect(themeFor("#EF7A4A", "#FFFFFF")).toBeUndefined();
    expect(themeDesign("terracota", "ondas", 9)).toEqual({ accentColor: "#B5532E", detailColor: "#F8D3BD", pattern: "ondas", patternSeed: 9 });
    expect(themeDesign("nope").accentColor).toBe(CARD_THEMES[0]!.background);
  });

  it("versions artwork by its inputs only", () => {
    expect(designVersion(["a", 1])).toBe(designVersion(["a", 1]));
    expect(designVersion(["a", 1])).not.toBe(designVersion(["a", 2]));
    const card = toPublicCard(DEMO_CARD);
    expect(artVersion({ ...card, bio: "otra bio" }, "strip")).toBe(artVersion(card, "strip"));
    expect(artVersion({ ...card, fullName: "Otra" }, "strip")).not.toBe(artVersion(card, "strip"));
    // The hero has no text: renaming doesn't bust Google's image cache.
    expect(artVersion({ ...card, fullName: "Otra" }, "hero")).toBe(artVersion(card, "hero"));
    expect(artVersion({ ...card, patternSeed: 1 }, "hero")).not.toBe(artVersion(card, "hero"));
  });
});

describe("artwork rendering", () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://passme.test");
  const card = toPublicCard(DEMO_CARD);

  it("renders the Apple strip at 1x/2x/3x in the card's background color", async () => {
    const images = await stripImages(card, null);
    expect(Object.keys(images).sort()).toEqual(["strip.png", "strip@2x.png", "strip@3x.png"]);
    const meta = await sharp(images["strip@3x.png"]!).metadata();
    expect([meta.width, meta.height]).toEqual([1125, 432]);

    // Top-left corner is plain background (#EF7A4A).
    const { data } = await sharp(images["strip.png"]!).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([239, 122, 74]);
  }, 30_000);

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
    // Center of the avatar seal (301, 72 pt) at 3x.
    const { data } = await sharp(images["strip@3x.png"]!).extract({ left: 903, top: 216, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(data[1]).toBeGreaterThan(150);
    expect(data[0]).toBeLessThan(80);
  }, 30_000);
});
