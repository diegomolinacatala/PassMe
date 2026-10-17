import { describe, expect, it } from "vitest";
import {
  blankDatesAndTimes,
  foldForLinkCheck,
  isSafeText,
  parseClose,
  parseMeetingRequest,
  unsafeTextReason,
} from "@/lib/meetings/schema";

const NOW = new Date("2026-10-02T09:00:00.000Z");
const proposal = {
  slots: ["2026-10-06T10:00:00.000Z"],
  duration: "30",
  format: "in_person",
  location: "Café Central",
  timeZone: "Europe/Madrid",
  name: "Marta Gil",
  email: "marta@example.com",
  phone: "",
  company: "Mirador",
  topic: "Un café",
  consent: true,
};
const parse = (fields: Partial<typeof proposal>) => parseMeetingRequest({ ...proposal, ...fields }, NOW);

// The regexes as they were before the rewrite (with lookbehinds), as the reference.
const OLD_DATE_RE = new RegExp(String.raw`(?<!\d)(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}(?!\d)`, "g");
const OLD_TIME_RE = new RegExp(String.raw`(?<!\d)(?:[01]?\d|2[0-3])[:h][0-5]\d(?!\d)`, "g");
const oldBlank = (s: string) => s.replace(OLD_DATE_RE, (m) => " ".repeat(m.length)).replace(OLD_TIME_RE, (m) => " ".repeat(m.length));

describe("dates and times are blanked out exactly as before the lookbehinds went", () => {
  it("matches the lookbehind version on the cases the heuristic exists for", () => {
    for (const text of [
      "Reunión el 27-10-2026",
      "Reunión el 27-10-2026 a las 10:30, o el 28/10/2026 10h30",
      "10:30 612 345 678",
      "612345678",
      "06.12.34.56.78",
      "1.1.2026",
      "x27-10-2026",
      "2027-10-2026",
      "27-10-20266",
      "110:30",
      "10:305",
      "",
      "10:30",
      "10:3010:30",
      "9h05 y 10h05",
    ]) {
      expect(blankDatesAndTimes(text), JSON.stringify(text)).toBe(oldBlank(text));
    }
  });

  it("matches the lookbehind version on random digit/separator soup", () => {
    // A tiny deterministic generator, so a failure is reproducible.
    let state = 20261017;
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const alphabet = ["0", "1", "2", "3", "5", "9", "-", "/", ".", ":", "h", " ", "a"];
    for (let i = 0; i < 3000; i += 1) {
      const length = 1 + Math.floor(next() * 24);
      let text = "";
      for (let j = 0; j < length; j += 1) text += alphabet[Math.floor(next() * alphabet.length)];
      expect(blankDatesAndTimes(text), JSON.stringify(text)).toBe(oldBlank(text));
    }
  });

  it("keeps the length of the text, so quoted fragments still line up", () => {
    const text = "el 27-10-2026 a las 10:30 llama al 612345678";
    expect(blankDatesAndTimes(text)).toHaveLength(text.length);
    expect(isSafeText("el 27-10-2026 a las 10:30")).toBe(true);
    expect(unsafeTextReason("el 27-10-2026 a las 10:30 llama al 612345678")).toBe("“612345678” parece un teléfono: ponlo en su campo.");
  });
});

describe("F7: lookalike dots and spelled-out dots don't hide a link", () => {
  it("folds the usual disguises to plain text", () => {
    expect(foldForLinkCheck("evil\u3002com")).toBe("evil.com"); // U+3002 ideographic full stop
    expect(foldForLinkCheck("evil\u2024com")).toBe("evil.com"); // U+2024 one dot leader
    expect(foldForLinkCheck("evil\uFF0Ecom")).toBe("evil.com"); // U+FF0E fullwidth full stop
    expect(foldForLinkCheck("evil\uFF61com")).toBe("evil.com"); // U+FF61 halfwidth ideographic full stop
    expect(foldForLinkCheck("evil[.]com")).toBe("evil.com");
    expect(foldForLinkCheck("evil(dot)com")).toBe("evil.com");
    expect(foldForLinkCheck("evil(DOT)com")).toBe("evil.com");
    expect(foldForLinkCheck("evil[dot]com")).toBe("evil.com");
    expect(foldForLinkCheck("ｅｖｉｌ\uFF0Eｃｏｍ＠ｘ")).toBe("evil.com@x"); // NFKC: fullwidth letters and "@"
  });

  it("treats the disguised links like the plain ones", () => {
    for (const topic of [
      "visita evil\u3002com",
      "visita evil\u2024com",
      "visita evil\uFF0Ecom",
      "visita evil\uFF61com",
      "visita evil[.]com",
      "visita evil(dot)com",
      "visita evil[dot]com",
      "visita ｅｖｉｌ\uFF0Eｃｏｍ",
      "visita bit\u3002ly",
      "mira acme\u3002io/precios",
      "escríbeme a ana＠x.es",
      "ｗｗｗ.spam.example",
    ]) {
      expect(parse({ topic }).ok, topic).toBe(false);
    }
    // Invisible format characters inside the domain (soft hyphen, zero-width joiners, word joiner).
    for (const code of [0x00ad, 0x200c, 0x200d, 0x2060]) {
      const topic = `visita evil${String.fromCharCode(code)}.com`;
      expect(parse({ topic }).ok, `U+${code.toString(16)}`).toBe(false);
    }
    // Cheap new gTLDs.
    for (const topic of ["mira claim.zip", "en x.lol", "visita free.ninja", "entra evil.cyou", "pasa por evil.sbs"]) {
      expect(parse({ topic }).ok, topic).toBe(false);
    }
    const quoted = parse({ topic: "visita evil\u3002com" });
    expect(!quoted.ok && quoted.errors.topic).toBe("“evil.com” parece un enlace. Escríbelo sin el punto.");
  });

  it("catches fullwidth digits as a phone number", () => {
    expect(parse({ topic: "llámame al ６１２３４５６７８" }).ok).toBe(false);
  });

  it("applies to the answers' notes too", () => {
    expect(parseClose({ note: "mira evil\u3002com" }).ok).toBe(false);
    expect(parseClose({ note: "mira evil[.]com" }).ok).toBe(false);
    expect(parseClose({ note: "Mejor a mediodía, gracias" }).ok).toBe(true);
  });

  it("does not flip the heuristic for ordinary text", () => {
    for (const fields of [
      { topic: "Nos vimos en Expo.Pack" },
      { topic: "Nos vimos en Expo\u3002Pack" },
      { topic: "Nos vimos en Expo(dot)Pack" },
      { company: "Grupo Aranda S.L." },
      { company: "EE.UU. y CC.OO." },
      { topic: "Reunión el 27-10-2026" },
      { topic: "Reunión el 27\uFF0E10\uFF0E2026 a las 10：30" },
      { topic: "Reunión el 27-10-2026 a las 10:30, o el 28/10/2026 10h30" },
      { topic: "Precio 3.5 por unidad" },
      { topic: "Polka (dot) Studio" },
      { name: "Marta (Aranda)" },
      { name: "Mª José O'Connor" },
      { name: "Ａｌｅｘ Ｒｉｖｅｒａ" },
    ]) {
      expect(parse(fields).ok, JSON.stringify(fields)).toBe(true);
    }
  });
});

describe("F8: no control or format characters in the guest's email or phone", () => {
  it("rejects them wherever they sit", () => {
    for (const email of [
      "marta@example.com\r\nBcc: evil@example.com",
      "marta@exam\u200Bple.com", // zero-width space
      "mar\u0000ta@example.com",
      "marta@example.com\u202E",
      "mar\u00ADta@example.com", // soft hyphen
      "marta@exa\tmple.com",
      "\u200Fmarta@example.com",
    ]) {
      const result = parse({ email });
      expect(result.ok, JSON.stringify(email)).toBe(false);
      if (!result.ok) expect(result.errors.email).toBe("Email no válido.");
    }
    for (const phone of ["+34 600\u200E000 000", "+34\u0000600000000", "600 000 000\u2066", "+34\n600000000"]) {
      const result = parse({ phone });
      expect(result.ok, JSON.stringify(phone)).toBe(false);
      if (!result.ok) expect(result.errors.phone).toBe("Solo números, espacios y el prefijo +.");
    }
  });

  it("still takes normal values, with the usual padding", () => {
    const ok = parse({ email: "  Marta.Gil+pass@Example.com ", phone: " +34 600 000 000 " });
    expect(ok.ok && ok.data.email).toBe("marta.gil+pass@example.com");
    expect(ok.ok && ok.data.phone).toBe("+34 600 000 000");
  });
});
