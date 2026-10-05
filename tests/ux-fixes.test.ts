import { describe, expect, it } from "vitest";
import { DEMO_CARD } from "@/lib/card/demo";
import { describeErrors } from "@/lib/card/save-errors";
import { buildVCard, savedWithPassMeNote, splitName, vcardContentDisposition } from "@/lib/card/vcard";
import { meetingStage } from "@/lib/meetings/state";
import { DEMO_MEETING_IDS, demoMeetingById, isDemoMeetingId } from "@/lib/meetings/view";
import { isNavigation } from "@/lib/pass/http";

describe("vCard details", () => {
  it("keeps two surnames with three words or more", () => {
    expect(splitName("Ana María López Gil")).toEqual({ given: "Ana María", family: "López Gil" });
    expect(splitName("Ana López Gil")).toEqual({ given: "Ana", family: "López Gil" });
    expect(splitName("Alex Rivera")).toEqual({ given: "Alex", family: "Rivera" });
  });

  it("writes N with both surnames", () => {
    const vcf = buildVCard({ ...DEMO_CARD, fullName: "Ana María López Gil" }, { profileUrl: "https://x.y/u/ana" });
    expect(vcf).toContain("N:López Gil;Ana María;;;");
  });

  it("notes when and where the contact was saved, after the bio", () => {
    const note = savedWithPassMeNote("getpassme.com/u/alex", new Date("2026-10-05T10:00:00Z"));
    expect(note).toBe("Guardado con PassMe el 05/10/2026 · getpassme.com/u/alex");
    const vcf = buildVCard({ ...DEMO_CARD, bio: "Hola" }, { profileUrl: "https://x.y/u/demo", savedNote: note });
    expect(vcf.replace(/\r\n /g, "")).toContain("NOTE:Hola\\n\\nGuardado con PassMe el 05/10/2026 · getpassme.com/u/alex");
  });

  it("names the file after the person, with an ASCII fallback", () => {
    expect(vcardContentDisposition("attachment", "Alex Rivera", "alex-rivera")).toBe(
      `attachment; filename="alex-rivera.vcf"; filename*=UTF-8''Alex%20Rivera.vcf`,
    );
    expect(vcardContentDisposition("inline", "Peña/\"x\"", "pena")).toBe(`inline; filename="pena.vcf"; filename*=UTF-8''Pe%C3%B1a%20x.vcf`);
    expect(vcardContentDisposition("inline", "  ", "a")).toBe(`inline; filename="a.vcf"`);
  });
});

describe("save errors", () => {
  it("names a single missing field", () => {
    expect(describeErrors({ fullName: "x" }, { fullName: "" })).toBe("Falta tu nombre.");
    expect(describeErrors({ headline: "x" }, { fullName: "Alex" })).toBe("Revisa el cargo.");
    expect(describeErrors({ "links.2.value": "x" }, { fullName: "Alex" })).toBe("Revisa uno de tus datos de contacto.");
  });

  it("counts several and falls back to the form message", () => {
    expect(describeErrors({ fullName: "x", slug: "y", bio: "z" }, { fullName: "" })).toBe("Hay 3 campos por revisar.");
    expect(describeErrors({ _form: "No se pudo guardar." }, { fullName: "Alex" })).toBe("No se pudo guardar.");
  });
});

describe("demo meetings", () => {
  const now = new Date("2026-10-05T15:50:00Z");

  it("has one sample per state", () => {
    const stages = Object.fromEntries(DEMO_MEETING_IDS.map((id) => [id, meetingStage(demoMeetingById(id, now), now)]));
    expect(stages).toEqual({
      demo: "awaiting",
      "demo-confirmada": "confirmed",
      "demo-contra": "awaiting",
      "demo-caducada": "expired",
      "demo-pasada": "past",
    });
    expect(demoMeetingById("demo-contra", now).proposedBy).toBe("owner");
  });

  it("only recognises its own ids", () => {
    expect(isDemoMeetingId("demo-confirmada")).toBe(true);
    expect(isDemoMeetingId("11111111-2222-4333-8444-555555555555")).toBe(false);
  });
});

describe("pass downloads", () => {
  it("tells a followed link from a script", () => {
    expect(isNavigation(new Request("https://x.y/api/pass/apple", { headers: { accept: "text/html,*/*" } }))).toBe(true);
    expect(isNavigation(new Request("https://x.y/api/pass/apple", { headers: { "sec-fetch-mode": "navigate" } }))).toBe(true);
    expect(isNavigation(new Request("https://x.y/api/pass/apple", { headers: { accept: "application/json" } }))).toBe(false);
  });
});
