import { describe, expect, it } from "vitest";
import {
  contactRequestsToCsv,
  contactRequestsToVCard,
  parseContactRequest,
  type ContactRequest,
} from "@/lib/card/contact";
import { isPlaceholderSlug, slugCandidate, suggestSlug } from "@/lib/card/slug";

const base = { name: "  Lucía   Martín ", email: "Lucia@Example.com", phone: "", company: "", message: "", consent: true };

describe("contact request validation", () => {
  it("normalizes what the visitor typed", () => {
    const result = parseContactRequest({ ...base, phone: "0034 600 000 000", message: "Hola\r\n\r\n\r\n\r\nqué tal" });
    expect(result).toEqual({
      ok: true,
      data: {
        name: "Lucía Martín",
        email: "lucia@example.com",
        phone: "+34 600 000 000",
        company: "",
        message: "Hola\n\nqué tal",
        consent: true,
      },
    });
  });

  it("needs a name, a way to reach them and consent", () => {
    const result = parseContactRequest({ ...base, name: " ", email: "", consent: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["consent", "email", "name"]);
  });

  it("rejects malformed contacts and oversized text", () => {
    const bad = parseContactRequest({ ...base, email: "nope", phone: "call me" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["email", "phone"]);
    expect(parseContactRequest({ ...base, message: "x".repeat(501) }).ok).toBe(false);
    expect(parseContactRequest({ ...base, consent: "on" }).ok).toBe(false);
    // Addresses crafted to inject mailto: headers into the owner's email client.
    expect(parseContactRequest({ ...base, email: "x?bcc=evil@example.com" }).ok).toBe(false);
  });
});

const request: ContactRequest = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "=HYPERLINK(\"http://evil\")",
  email: "lucia@example.com",
  phone: "+34 600 000 000",
  company: "Hotel; Mirador, S.L.",
  message: "Línea 1\nLínea \"2\"",
  source: "qr",
  createdAt: "2026-09-29T10:00:00.000Z",
};

describe("contact exports", () => {
  it("writes CSV that spreadsheets open safely", () => {
    const csv = contactRequestsToCsv([request]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, row] = csv.slice(1).trim().split("\r\n");
    expect(header).toBe('"Fecha","Nombre","Email","Teléfono","Empresa","Mensaje","Origen"');
    // Formulas are neutralized, phones stay readable, quotes are doubled.
    expect(row).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(row).toContain('"+34 600 000 000"');
    expect(row).toContain('"Línea 1\nLínea ""2"""');
  });

  it("builds one vCard per request with escaped text", () => {
    const vcf = contactRequestsToVCard([request, { ...request, id: "x", name: "Ana", phone: null, message: "" }]);
    expect(vcf.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(vcf).toContain("ORG:Hotel\\; Mirador\\, S.L.");
    expect(vcf).toContain("TEL;TYPE=CELL:+34600000000");
    expect(vcf).toContain("EMAIL;TYPE=INTERNET:lucia@example.com");
    expect(vcf).toMatch(/NOTE:Línea 1\\nLínea "2"\\n\\nContacto recibido con PassMe el 2026-09-29/);
  });
});

describe("placeholder handles", () => {
  it("recognizes the handle new cards get and suggests one from the name", () => {
    expect(isPlaceholderSlug(slugCandidate("tarjeta", "3f9a1c"))).toBe(true);
    expect(isPlaceholderSlug("tarjeta-roja")).toBe(false);
    expect(suggestSlug("José Núñez Gil")).toBe("jose-nunez-gil");
    expect(suggestSlug("Al")).toBeNull();
    expect(suggestSlug("Admin")).toBeNull(); // reserved
  });
});
