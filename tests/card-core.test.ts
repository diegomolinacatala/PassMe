import { describe, expect, it } from "vitest";
import { cardPalette, contrastRatio, parseHex, toHex, toRgbString } from "@/lib/card/colors";
import { CARD_THEMES } from "@/lib/card/design";
import { checkSlug, slugCandidate, slugify } from "@/lib/card/slug";
import { parseCardInput, sanitizeStoredLinks } from "@/lib/card/schema";
import { buildVCard, escapeText, foldLine, splitName, vcardFilename } from "@/lib/card/vcard";
import { DEMO_CARD } from "@/lib/card/demo";

describe("colors", () => {
  it("parses and formats hex colors", () => {
    expect(parseHex("#FF4A1C")).toEqual({ r: 255, g: 74, b: 28 });
    expect(parseHex("FF4A1C")).toBeNull();
    expect(toHex({ r: 255, g: 74, b: 28 })).toBe("#FF4A1C");
    expect(toRgbString({ r: 1.4, g: 2, b: 3 })).toBe("rgb(1, 2, 3)");
  });

  it("picks white text on dark backgrounds and ink on light ones", () => {
    expect(cardPalette("#221B17").isDark).toBe(true);
    expect(cardPalette("#E9DFCB").isDark).toBe(false);
    // Invalid input falls back to the (light) Naranja default with dark text.
    expect(cardPalette("not-a-color").isDark).toBe(false);
  });

  it("keeps every theme readable (WCAG AA body text)", () => {
    for (const theme of CARD_THEMES) {
      const p = cardPalette(theme.background, theme.detail);
      expect(contrastRatio(p.background, p.foreground), theme.name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("slug", () => {
  it("validates format, length and reserved words", () => {
    expect(checkSlug("alex-rivera")).toEqual({ ok: true });
    expect(checkSlug("ab")).toEqual({ ok: false, reason: "length" });
    expect(checkSlug("Alex")).toEqual({ ok: false, reason: "format" });
    expect(checkSlug("alex--rivera")).toEqual({ ok: false, reason: "format" });
    expect(checkSlug("-alex")).toEqual({ ok: false, reason: "format" });
    expect(checkSlug("dashboard")).toEqual({ ok: false, reason: "reserved" });
  });

  it("slugifies accents and symbols", () => {
    expect(slugify("José Núñez")).toBe("jose-nunez");
    expect(slugify("  --Hello__World!! ")).toBe("hello-world");
  });

  it("builds valid candidates from any seed", () => {
    for (const seed of ["ana.b@example.com", "", "x", "Ñ", "a".repeat(80)]) {
      const candidate = slugCandidate(seed, "k3v9");
      expect(checkSlug(candidate).ok, candidate).toBe(true);
    }
  });
});

const validInput = {
  slug: "Alex-Rivera ",
  fullName: "  Alex   Rivera ",
  headline: "Product Designer",
  company: "Estudio Norte",
  location: "",
  pronouns: "",
  bio: "Línea 1\r\n\r\n\r\n\r\nLínea 2",
  accentColor: "#FF4A1C",
  detailColor: null,
  pattern: "arco",
  patternSeed: 42,
  typeface: "clasica",
  avatarPath: null,
  isPublished: true,
  links: [
    { id: "link-email", kind: "email", value: "ALEX@example.com", visible: true },
    { id: "link-ig", kind: "instagram", value: "@estudio.norte", label: "", visible: false },
  ],
};

describe("parseCardInput", () => {
  it("normalizes a valid card", () => {
    const result = parseCardInput(validInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.slug).toBe("alex-rivera");
    expect(result.data.fullName).toBe("Alex Rivera");
    expect(result.data.bio).toBe("Línea 1\n\nLínea 2");
    expect(result.data.links[0].value).toBe("alex@example.com");
    expect(result.data.links[1]).toEqual({ id: "link-ig", kind: "instagram", value: "estudio.norte", visible: false });
  });

  it("reports field-level errors", () => {
    const result = parseCardInput({
      ...validInput,
      slug: "admin",
      fullName: "   ",
      accentColor: "red",
      detailColor: "#GGGGGG",
      links: [
        { id: "link-1", kind: "website", value: "javascript:alert(1)", visible: true },
        { id: "link-1", kind: "custom", value: "https://example.com", visible: true },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors)).toEqual(
      expect.arrayContaining([
        "slug",
        "fullName",
        "accentColor",
        "detailColor",
        "links.0.value",
        "links.1.id",
        "links.1.label",
      ]),
    );
  });

  it("rejects unknown motifs, retired motifs, typefaces and out-of-range variations", () => {
    const result = parseCardInput({ ...validInput, pattern: "tartan", patternSeed: 1_000_000, typeface: "comic" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors)).toEqual(expect.arrayContaining(["pattern", "patternSeed", "typeface"]));
    expect(parseCardInput({ ...validInput, patternSeed: 1.5 }).ok).toBe(false);
    // Clients only ever send current motifs; retired ones are mapped on read.
    expect(parseCardInput({ ...validInput, pattern: "sello" }).ok).toBe(false);
    expect(
      parseCardInput({ ...validInput, detailColor: "#FFE3D1", pattern: "monograma", patternSeed: 999_999, typeface: "editorial" }).ok,
    ).toBe(true);
  });

  it("rejects unknown link kinds and too many links", () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({
      id: `link-${i}xx`,
      kind: "email",
      value: `a${i}@example.com`,
      visible: true,
    }));
    expect(parseCardInput({ ...validInput, links: tooMany }).ok).toBe(false);
    expect(
      parseCardInput({ ...validInput, links: [{ id: "abcdef", kind: "myspace", value: "x", visible: true }] }).ok,
    ).toBe(false);
  });

  it("strips control characters", () => {
    const result = parseCardInput({ ...validInput, headline: "Designer\u0000\u0007 Lead" });
    expect(result.ok && result.data.headline).toBe("Designer Lead");
  });
});

describe("sanitizeStoredLinks", () => {
  it("drops malformed entries", () => {
    const links = sanitizeStoredLinks([
      { id: "good-1", kind: "email", value: "a@example.com", visible: true },
      { id: "bad", kind: "email", value: "a@example.com", visible: true },
      { id: "bad-kind", kind: "fax", value: "1", visible: true },
      { id: "bad-value", kind: "website", value: "javascript:x", visible: true },
      "nope",
    ]);
    expect(links.map((l) => l.id)).toEqual(["good-1"]);
    expect(sanitizeStoredLinks(null)).toEqual([]);
  });
});

describe("vcard", () => {
  it("escapes TEXT values", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("folds long lines at 75 octets without breaking UTF-8", () => {
    const folded = foldLine(`NOTE:${"ñ".repeat(100)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`NOTE:${"ñ".repeat(100)}`);
  });

  it("splits names", () => {
    expect(splitName("Ana María López")).toEqual({ given: "Ana", family: "María López" });
    expect(splitName("Cher")).toEqual({ given: "Cher", family: "" });
  });

  it("includes only visible links and the profile URL", () => {
    const vcf = buildVCard(DEMO_CARD, { profileUrl: "https://passme.app/u/demo" });
    expect(vcf.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(vcf.endsWith("END:VCARD\r\n")).toBe(true);
    expect(vcf).toContain("FN:Alex Rivera");
    expect(vcf).toContain("N:Rivera;Alex;;;");
    expect(vcf).toContain("ORG:Estudio Norte");
    expect(vcf).toContain("EMAIL;TYPE=INTERNET:alex@example.com");
    expect(vcf).toContain(".URL:https://www.instagram.com/estudio.norte");
    expect(vcf).toContain(".X-ABLabel:Portfolio");
    expect(vcf).toContain(".URL:https://passme.app/u/demo");
    expect(vcf).not.toContain("600 000 000");
    expect(vcf).not.toContain("TEL");
  });

  it("dedupes phone numbers shared with WhatsApp", () => {
    const vcf = buildVCard(
      {
        ...DEMO_CARD,
        links: [
          { id: "p-1111", kind: "phone", value: "+34 600 000 000", visible: true },
          { id: "w-1111", kind: "whatsapp", value: "+34600000000", visible: true },
        ],
      },
      { profileUrl: "https://passme.app/u/demo" },
    );
    expect(vcf.match(/TEL;/g)).toHaveLength(1);
    expect(vcf).toContain("URL:https://wa.me/34600000000");
  });

  it("embeds an optional photo", () => {
    const vcf = buildVCard(DEMO_CARD, { profileUrl: "https://x.y/u/demo", photo: { base64: "AAAA", type: "JPEG" } });
    expect(vcf).toContain("PHOTO;ENCODING=b;TYPE=JPEG:AAAA");
  });

  it("sanitizes filenames", () => {
    expect(vcardFilename("alex-rivera")).toBe("alex-rivera.vcf");
    expect(vcardFilename("../../etc")).toBe("etc.vcf");
  });
});

describe("card palette labels", () => {
  it("keeps small labels at WCAG AA contrast on every swatch and on extremes", () => {
    for (const hex of [...CARD_THEMES.map((t) => t.background), "#FFFFFF", "#000000", "#808080", "#FF0000", "#00FF00"]) {
      for (const detail of [null, "#FFE3D1", "#E4572A", hex]) {
        const p = cardPalette(hex, detail);
        expect(contrastRatio(p.label, p.background), `${hex} / ${detail}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
