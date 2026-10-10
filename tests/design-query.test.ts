import { describe, expect, it } from "vitest";
import { createWithDesignPath, parseDesignQuery } from "@/lib/card/design-query";
import { coerceQuickDraft, EMPTY_QUICK_DRAFT, parseQuickDraft, quickDraftToCardInput, quickDraftToPublicCard } from "@/lib/card/quick";
import { parseCardInput } from "@/lib/card/schema";

/** A design chosen on the landing ("Hazla tuya") travels to /crear and into the card. */
describe("design chosen before the card exists", () => {
  it("round-trips through the /crear link", () => {
    const design = { theme: "cafe", pattern: "corriente", typeface: "cursiva", patternSeed: 4821 } as const;
    const path = createWithDesignPath(design);
    expect(path).toBe("/crear?tema=cafe&motivo=corriente&letra=cursiva&variacion=4821");
    const query = Object.fromEntries(new URL(`https://getpassme.com${path}`).searchParams.entries());
    expect(parseDesignQuery(query)).toEqual(design);
  });

  it("is null when the link carries no design, and safe when it carries nonsense", () => {
    expect(parseDesignQuery({})).toBeNull();
    expect(parseDesignQuery({ de: "demo", via: "qr" })).toBeNull();
    expect(parseDesignQuery({ tema: "neon", motivo: "sello", letra: "comic", variacion: "-3" })).toEqual({
      theme: "naranja",
      pattern: "arco",
      typeface: "clasica",
      patternSeed: 0,
    });
    expect(parseDesignQuery({ tema: ["salvia", "cafe"], variacion: "1e3" })).toEqual({
      theme: "salvia",
      pattern: "arco",
      typeface: "clasica",
      patternSeed: 1000,
    });
  });

  it("reaches the quick draft, the preview and the card that gets created", () => {
    const draft = coerceQuickDraft({ fullName: "Lucía Ferrer", email: "lucia@example.com", theme: "salvia", pattern: "persiana", typeface: "moderna", patternSeed: 7 });
    expect(draft).toMatchObject({ pattern: "persiana", typeface: "moderna" });
    expect(coerceQuickDraft({ pattern: "ondas", typeface: 3 })).toMatchObject({ pattern: EMPTY_QUICK_DRAFT.pattern, typeface: EMPTY_QUICK_DRAFT.typeface });

    expect(quickDraftToPublicCard(draft)).toMatchObject({ accentColor: "#CDD5BD", pattern: "persiana", typeface: "moderna", patternSeed: 7 });

    const parsed = parseQuickDraft(draft);
    if (!parsed.ok) throw new Error("invalid fixture");
    const card = parseCardInput(quickDraftToCardInput(parsed.data, { slug: "lucia-ferrer", linkId: (i) => `l-test${i}xx` }));
    expect(card.ok).toBe(true);
    if (!card.ok) return;
    expect(card.data).toMatchObject({ accentColor: "#CDD5BD", detailColor: "#5F6B47", pattern: "persiana", typeface: "moderna", patternSeed: 7 });
  });
});
