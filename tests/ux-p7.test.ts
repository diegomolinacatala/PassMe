import { describe, expect, it } from "vitest";
import { initials, passNameOverflows } from "@/lib/card/name";
import { normalizeSlugInput, slugAlternatives } from "@/lib/card/slug";

/** Block P7 of the 2026-10-05 UX audit: the editor. */

describe("P7.8 slug input", () => {
  it("turns underscores, dots and spaces into hyphens and drops accents", () => {
    expect(normalizeSlugInput("pablo_serrano")).toBe("pablo-serrano");
    expect(normalizeSlugInput("Pablo.Serrano")).toBe("pablo-serrano");
    expect(normalizeSlugInput("José Núñez")).toBe("jose-nunez");
    expect(normalizeSlugInput("ana__b")).toBe("ana-b");
    expect(normalizeSlugInput("hola@mundo!")).toBe("holamundo");
  });

  it("keeps a trailing hyphen while typing and caps the length", () => {
    expect(normalizeSlugInput("pablo-")).toBe("pablo-");
    expect(normalizeSlugInput("a".repeat(40))).toHaveLength(32);
  });

  it("offers valid alternatives, best first, never the taken one", () => {
    expect(slugAlternatives("pablo-serrano").slice(0, 2)).toEqual(["pablo-serrano-2", "pabloserrano"]);
    expect(slugAlternatives("pablo-serrano-2")).not.toContain("pablo-serrano-2");
    expect(slugAlternatives("pablo-serrano-2")[0]).toBe("pabloserrano");
    expect(slugAlternatives("ana")).toEqual(["ana-2", "ana-3", "ana-4", "ana-5"]);
    for (const alternative of slugAlternatives("a".repeat(32))) expect(alternative.length).toBeLessThanOrEqual(32);
  });
});

describe("P7.9 initials and long names", () => {
  it("uses the name and the first surname that isn't a particle", () => {
    expect(initials("Pablo Serrano Iglesias de la Fuente")).toBe("PS");
    expect(initials("María de la Fuente")).toBe("MF");
    expect(initials("Ana del Río")).toBe("AR");
    expect(initials("Alex Rivera")).toBe("AR");
    expect(initials("  lucía   ferrer ")).toBe("LF");
  });

  it("handles one word, nothing and only particles", () => {
    expect(initials("Cher")).toBe("C");
    expect(initials("")).toBe("·");
    expect(initials("Juan de la")).toBe("JL");
    expect(initials("Élodie Ñúñez")).toBe("ÉÑ");
  });

  it("warns when the name won't fit in the pass's two lines", () => {
    expect(passNameOverflows("Pablo Serrano Iglesias de la Fuente")).toBe(true);
    expect(passNameOverflows("Alex Rivera")).toBe(false);
    expect(passNameOverflows("María José Fernández López")).toBe(false);
    expect(passNameOverflows("")).toBe(false);
  });
});

describe("P7.7 hex colors typed by hand", async () => {
  const { parseHexInput } = await import("@/lib/card/colors");
  it("accepts #RRGGBB, without # and the short form", () => {
    expect(parseHexInput("#1f3a5f")).toBe("#1F3A5F");
    expect(parseHexInput(" 1F3A5F ")).toBe("#1F3A5F");
    expect(parseHexInput("#abc")).toBe("#AABBCC");
  });
  it("rejects anything else", () => {
    for (const raw of ["", "#12345", "#GGGGGG", "red", "#1F3A5F0"]) expect(parseHexInput(raw)).toBeNull();
  });
});

describe("P7.3 contact details", async () => {
  const { detectLink } = await import("@/lib/card/link-detect");
  const { EDITABLE_LINK_KINDS, linkTitle, toLinkKind } = await import("@/lib/card/links");
  const { parseCardInput, sanitizeStoredLinks } = await import("@/lib/card/schema");
  const { dropIndex, moveItem } = await import("@/lib/reorder");

  it("detects the kind of whatever is pasted", () => {
    const kind = (raw: string) => detectLink(raw)?.kind ?? null;
    expect(kind("https://www.linkedin.com/in/pablo")).toBe("linkedin");
    expect(kind("linkedin.com/in/pablo")).toBe("linkedin");
    expect(kind("pablo@estudio.es")).toBe("email");
    expect(kind("+34 600 11 22 33")).toBe("phone");
    expect(kind("600112233")).toBe("phone");
    expect(kind("instagram.com/pablo")).toBe("instagram");
    expect(kind("https://x.com/pablo")).toBe("x");
    expect(kind("twitter.com/pablo")).toBe("x");
    expect(kind("github.com/pablo")).toBe("github");
    expect(kind("https://www.tiktok.com/@pablo")).toBe("tiktok");
    expect(kind("youtube.com/@pablo")).toBe("youtube");
    expect(kind("t.me/pablo_serrano")).toBe("telegram");
    expect(kind("calendly.com/pablo")).toBe("booking");
    expect(kind("https://cal.com/pablo")).toBe("booking");
    expect(kind("https://www.behance.net/pablo")).toBe("website");
  });

  it("turns wa.me links and mailto/tel into the value each kind expects", () => {
    expect(detectLink("https://wa.me/34600112233")).toEqual({ kind: "whatsapp", value: "+34600112233" });
    expect(detectLink("mailto:pablo@estudio.es")).toEqual({ kind: "email", value: "pablo@estudio.es" });
    expect(detectLink("tel:+34600112233")).toEqual({ kind: "phone", value: "+34600112233" });
  });

  it("doesn't guess when it can't tell", () => {
    for (const raw of ["", "   ", "@pablo", "pablo", "hola mundo"]) expect(detectLink(raw)).toBeNull();
  });

  it("offers a single web kind", () => {
    expect(EDITABLE_LINK_KINDS).not.toContain("custom");
    expect(EDITABLE_LINK_KINDS).toHaveLength(12);
  });

  it("reads and saves the retired «Otra web» as «Web», with or without a title", () => {
    expect(toLinkKind("custom")).toBe("website");
    expect(toLinkKind("email")).toBe("email");
    const stored = sanitizeStoredLinks([
      { id: "l-custom-1", kind: "custom", value: "https://example.com", label: "Portfolio", visible: true },
      { id: "l-custom-2", kind: "custom", value: "https://example.org", visible: true },
    ]);
    expect(stored.map((link) => link.kind)).toEqual(["website", "website"]);
    const saved = parseCardInput({
      slug: "pablo",
      fullName: "Pablo",
      headline: "",
      company: "",
      location: "",
      pronouns: "",
      bio: "",
      accentColor: "#EF7A4A",
      detailColor: null,
      pattern: "arco",
      patternSeed: 1,
      typeface: "clasica",
      avatarPath: null,
      isPublished: true,
      links: [{ id: "l-custom-3", kind: "custom", value: "example.net", visible: true }],
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.data.links[0]).toMatchObject({ kind: "website", value: "https://example.net" });
  });

  it("shows a web's domain when it has no title", () => {
    expect(linkTitle({ kind: "website", value: "https://www.behance.net/pablo" })).toBe("behance.net");
    expect(linkTitle({ kind: "website", value: "https://example.com", label: "Portfolio" })).toBe("Portfolio");
    expect(linkTitle({ kind: "website", value: "not a url" })).toBe("Web");
  });

  it("moves an item and finds where a dragged row lands", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
    const list = ["a", "b"];
    moveItem(list, 0, 1);
    expect(list).toEqual(["a", "b"]);
    expect(dropIndex([10, 50, 90], 5)).toBe(0);
    expect(dropIndex([10, 50, 90], 60)).toBe(2);
    expect(dropIndex([10, 50, 90], 200)).toBe(3);
  });
});

describe("P7.1 sections", async () => {
  const { mobileSectionOrder, sectionLayout } = await import("@/components/editor/sections");
  it("raises the inbox above «Estilo» on phones only when it has items", () => {
    expect(mobileSectionOrder({}).slice(0, 3)).toEqual(["quien", "contactar", "estilo"]);
    expect(mobileSectionOrder({ reuniones: true, contactos: true }).slice(0, 5)).toEqual(["quien", "contactar", "reuniones", "contactos", "estilo"]);
    expect(mobileSectionOrder({ contactos: true })).toHaveLength(10);
  });
  it("numbers each section for its breakpoint", () => {
    const layout = sectionLayout({ reuniones: true });
    expect(layout.reuniones).toMatchObject({ number: "07", mobileNumber: "03", orderClass: "max-lg:order-4" });
    expect(layout.quien).toMatchObject({ number: "01", mobileNumber: "01", orderClass: "max-lg:order-2" });
  });
});

describe("P7.5 photo framing", async () => {
  const { clampView, cropRect, isHeic, zoomView } = await import("@/lib/card/crop");
  const base = { width: 1000, height: 500, viewport: 250, zoom: 1, x: 0, y: 0 };

  it("crops the centered square by default", () => {
    expect(cropRect(base)).toEqual({ sx: 250, sy: 0, size: 500 });
  });

  it("follows the drag and never leaves the image", () => {
    // Dragging the photo right shows more of its left side.
    expect(cropRect({ ...base, x: 50 })).toEqual({ sx: 150, sy: 0, size: 500 });
    expect(clampView({ ...base, x: 10_000, y: 10_000 })).toMatchObject({ x: 125, y: 0 });
    expect(cropRect({ ...base, x: 10_000 }).sx).toBe(0);
  });

  it("zooms in around the center, within limits", () => {
    expect(cropRect(zoomView(base, 2))).toEqual({ sx: 375, sy: 125, size: 250 });
    expect(zoomView(base, 10).zoom).toBe(4);
    expect(zoomView(base, 0.2).zoom).toBe(1);
  });

  it("recognises HEIC by type or name", () => {
    expect(isHeic({ name: "IMG_0001.HEIC", type: "" })).toBe(true);
    expect(isHeic({ name: "foto", type: "image/heif" })).toBe(true);
    expect(isHeic({ name: "foto.jpg", type: "image/jpeg" })).toBe(false);
  });
});
