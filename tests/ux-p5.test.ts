import { describe, expect, it } from "vitest";
import { CONTACT_ONE_OF_ERROR, parseContactRequest } from "@/lib/card/contact";
import { DEMO_CARD } from "@/lib/card/demo";
import { linkVerb, whatsappHrefForPhone } from "@/lib/card/links";
import { nameScale } from "@/lib/card/name-scale";
import { servesVCardInline, vcardContentDisposition, vcardDisplayFilename } from "@/lib/card/vcard";

/** Block P5 of the 2026-10-05 UX audit: the public card. */

describe("P5.5 WhatsApp next to a phone", () => {
  it("builds wa.me only from numbers with a country code", () => {
    expect(whatsappHrefForPhone("+34 612 345 678")).toBe("https://wa.me/34612345678");
    expect(whatsappHrefForPhone("0034 612-345-678")).toBe("https://wa.me/34612345678");
    expect(whatsappHrefForPhone("(+1) 415.555.0100")).toBeNull();
    expect(whatsappHrefForPhone("612 345 678")).toBeNull();
  });

  it("never lets anything but digits into the href", () => {
    expect(whatsappHrefForPhone("+34 612/../evil")).toBeNull();
    expect(whatsappHrefForPhone("+34612345678?text=hola")).toBeNull();
    expect(whatsappHrefForPhone("javascript:alert(1)")).toBeNull();
    expect(whatsappHrefForPhone("+12")).toBeNull();
  });

  it("each row says what tapping does", () => {
    expect(linkVerb("phone")).toBe("Llamar");
    expect(linkVerb("email")).toBe("Escribir");
    expect(linkVerb("whatsapp")).toBe("WhatsApp");
    expect(linkVerb("website")).toBe("Abrir");
    expect(linkVerb("linkedin")).toBe("Abrir");
  });

  it("the demo card shows a mobile with a country code (and keeps a hidden one)", () => {
    const visible = DEMO_CARD.links.filter((l) => l.kind === "phone" && l.visible);
    expect(visible).toHaveLength(1);
    expect(whatsappHrefForPhone(visible[0].value)).toBe("https://wa.me/34612345678");
    expect(DEMO_CARD.links.some((l) => l.kind === "phone" && !l.visible)).toBe(true);
  });
});

describe("P5.4 name size", () => {
  it("steps down for long names", () => {
    expect(nameScale("Alex Rivera")).toBe("lg");
    expect(nameScale("x".repeat(24))).toBe("lg");
    expect(nameScale("x".repeat(25))).toBe("md");
    expect(nameScale("x".repeat(36))).toBe("md");
    expect(nameScale("x".repeat(37))).toBe("sm");
    expect(nameScale("María de los Ángeles Fernández-Villaverde")).toBe("sm");
  });

  it("counts characters, not UTF-16 units, and ignores outer spaces", () => {
    expect(nameScale(`  ${"é".repeat(24)}  `)).toBe("lg");
    expect(nameScale("😀".repeat(24))).toBe("lg");
  });
});

describe("P5.6 «al menos uno»", () => {
  it("marks both phone and email when neither is there", () => {
    const result = parseContactRequest({ name: "Lucía", email: "", phone: "", company: "", message: "", consent: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.phone).toBe(CONTACT_ONE_OF_ERROR);
    expect(result.errors.email).toBe(CONTACT_ONE_OF_ERROR);
  });

  it("is happy with just a phone", () => {
    expect(parseContactRequest({ name: "Lucía", email: "", phone: "+34 612 345 678", company: "", message: "", consent: true }).ok).toBe(true);
  });
});

describe("P5.3 «Guardar contacto» says which file to open", () => {
  it("names the file like the download does", () => {
    expect(vcardDisplayFilename("Alex Rivera", "alex")).toBe("Alex Rivera.vcf");
    expect(vcardDisplayFilename('  Ana / "La Jefa"  ', "ana")).toBe("Ana La Jefa.vcf");
    expect(vcardDisplayFilename("", "alex")).toBe("alex.vcf");
    expect(vcardContentDisposition("attachment", "Alex Rivera", "alex")).toContain("filename*=UTF-8''Alex%20Rivera.vcf");
    expect(vcardContentDisposition("inline", "", "alex")).toBe('inline; filename="alex.vcf"');
  });

  it("opens inline only on iOS", () => {
    expect(servesVCardInline("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(servesVCardInline("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(servesVCardInline("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe(false);
    expect(servesVCardInline(null)).toBe(false);
  });
});
