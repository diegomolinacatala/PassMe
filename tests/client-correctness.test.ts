import { redirect } from "next/navigation";
import { describe, expect, it } from "vitest";
import { codeFromInput, cleanCode } from "@/lib/auth/code";
import { isInAppBrowser } from "@/lib/auth/webview";
import { DEMO_CARD } from "@/lib/card/demo";
import { DESIGN_PARAMS } from "@/lib/card/design-query";
import { detectLink } from "@/lib/card/link-detect";
import { dialDigits, linkHref, whatsappHrefForPhone } from "@/lib/card/links";
import { EMPTY_QUICK_DRAFT } from "@/lib/card/quick";
import { parseCardInput } from "@/lib/card/schema";
import { buildVCard } from "@/lib/card/vcard";
import { callAction } from "@/lib/client/call-action";
import { cardEmailAfterCodeChange, restoreDraft, withoutDesignQuery } from "@/components/create/draft-rules";
import { cardDraftReducer, draftFromCard, draftToInput, type CardDraft } from "@/components/editor/use-card-draft";

/** 2026-10-17 audit, client correctness (W2). */

describe("callAction: a Server Action that never answers", () => {
  it("hands back the action's own result", async () => {
    await expect(callAction(async () => ({ ok: true as const, n: 1 }))).resolves.toEqual({ failed: false, result: { ok: true, n: 1 } });
  });

  it("turns a rejection (offline, a new deploy) into a value instead of throwing during render", async () => {
    const error = new TypeError("Failed to fetch");
    await expect(callAction(() => Promise.reject(error))).resolves.toEqual({ failed: true, error });
  });

  it("lets Next's redirect through untouched (createMyCardAction redirects on success)", async () => {
    await expect(callAction(async () => redirect("/dashboard?nueva=1"))).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });
});

describe("editor draft: a save that comes back", () => {
  const base = draftFromCard(DEMO_CARD);
  const state = (draft: CardDraft, saved: CardDraft = base) => ({ draft, saved });

  it("shows the card as the server stored it when nothing changed meanwhile", () => {
    const sent = { ...base, fullName: "Alex Rivera " };
    const stored = { ...sent, fullName: "Alex Rivera" };
    const next = cardDraftReducer(state(sent), { type: "saved", submitted: sent, saved: stored });
    expect(next.draft).toBe(stored);
    expect(next.saved).toBe(stored);
  });

  it("keeps what was typed while the save was on its way, still unsaved", () => {
    const sent = { ...base, headline: "Diseñadora" };
    const typedSince = cardDraftReducer(state(sent), { type: "field", field: "company", value: "Estudio Sur" });
    const next = cardDraftReducer(typedSince, { type: "saved", submitted: sent, saved: sent });
    expect(next.draft.company).toBe("Estudio Sur");
    expect(next.draft.headline).toBe("Diseñadora");
    expect(next.saved).toBe(sent);
    expect(JSON.stringify(next.draft)).not.toBe(JSON.stringify(next.saved));
  });

  it("discards back to the last saved card, not the one before", () => {
    const sent = { ...base, headline: "Diseñadora" };
    const typedSince = cardDraftReducer(state(sent), { type: "field", field: "company", value: "Estudio Sur" });
    const saved = cardDraftReducer(typedSince, { type: "saved", submitted: sent, saved: sent });
    expect(cardDraftReducer(saved, { type: "discard" }).draft).toBe(sent);
  });
});

describe("editor draft: meeting settings while meetings are off", () => {
  const brokenSettings = { ...DEMO_CARD.meetingSettings!, videoLink: "https://example.com/sala" };
  // The demo card's own slug ("demo") is reserved: any other valid one will do.
  const card = { ...DEMO_CARD, slug: "alex-rivera" };

  it("neither sends nor validates the hidden settings (the server keeps the stored ones)", () => {
    const draft = { ...draftFromCard(card), acceptsMeetingRequests: false, meetingSettings: brokenSettings };
    const input = draftToInput(draft);
    expect(input).not.toHaveProperty("meetingSettings");
    expect(parseCardInput(input).ok).toBe(true);
  });

  it("still checks them while meetings are on", () => {
    const draft = { ...draftFromCard(card), acceptsMeetingRequests: true, meetingSettings: brokenSettings };
    const result = parseCardInput(draftToInput(draft));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).some((key) => key.startsWith("meetingSettings"))).toBe(true);
  });
});

describe("/crear: the landing's design and a reload", () => {
  const initialDesign = { theme: "terracota", pattern: "cinta" as const, typeface: "cursiva" as const, patternSeed: 4821 };
  const stored = { ...EMPTY_QUICK_DRAFT, fullName: "Ana", theme: "cafe", patternSeed: 77 };

  it("lets a design chosen just now beat an older draft's", () => {
    const draft = restoreDraft(stored, { accountEmail: null, initialDesign, designChosen: true });
    expect(draft).toMatchObject({ fullName: "Ana", theme: "terracota", pattern: "cinta", typeface: "cursiva", patternSeed: 4821 });
  });

  it("keeps the color picked since when the link no longer carries a design", () => {
    const draft = restoreDraft(stored, { accountEmail: "ana@example.com", initialDesign, designChosen: false });
    expect(draft).toMatchObject({ theme: "cafe", patternSeed: 77, email: "ana@example.com" });
  });

  it("drops only the design from the address once it's in the draft", () => {
    const href = `https://getpassme.com/crear?de=alex&via=qr&${DESIGN_PARAMS.theme}=terracota&${DESIGN_PARAMS.pattern}=cinta&${DESIGN_PARAMS.typeface}=cursiva&${DESIGN_PARAMS.seed}=4821`;
    expect(withoutDesignQuery(href)).toBe("/crear?de=alex&via=qr");
    expect(withoutDesignQuery(`https://getpassme.com/crear?${DESIGN_PARAMS.theme}=cafe`)).toBe("/crear");
    expect(withoutDesignQuery("https://getpassme.com/crear?de=alex")).toBeNull();
  });
});

describe("/crear: «Cambiar email» on the code step", () => {
  it("corrects the card's email when the code had gone to it", () => {
    expect(cardEmailAfterCodeChange("ana@gmial.com", "ana@gmail.com", "Ana@gmial.com ")).toBe("ana@gmail.com");
  });

  it("leaves it alone when the code went elsewhere on purpose, or nothing changed", () => {
    expect(cardEmailAfterCodeChange("personal@example.com", "otra@example.com", "ana@estudio.es")).toBeNull();
    expect(cardEmailAfterCodeChange("ana@gmail.com", "ana@gmail.com", "ana@gmail.com")).toBeNull();
    expect(cardEmailAfterCodeChange(null, "ana@gmail.com", "")).toBeNull();
  });

  it("keeps the card's work email when the code moves to a personal inbox (not a typo)", () => {
    expect(cardEmailAfterCodeChange("ana@empresa.com", "ana@gmail.com", "ana@empresa.com")).toBeNull();
    expect(cardEmailAfterCodeChange("ana@estudio.es", "ana.garcia@estudio.es", "ana@estudio.es")).toBeNull();
    expect(cardEmailAfterCodeChange("ana@hotmial.com", "ana@hotmail.com", "ana@hotmial.com")).toBe("ana@hotmail.com");
  });
});

describe("«Pega un enlace»: odd pastes", () => {
  it("doesn't crash on a half-typed mailto escape", () => {
    expect(() => detectLink("mailto:a%")).not.toThrow();
    expect(detectLink("mailto:a%")).toEqual({ kind: "email", value: "a%" });
    expect(detectLink("mailto:ana%40estudio.es")).toEqual({ kind: "email", value: "ana@estudio.es" });
  });

  it("reads a phone only from click-to-chat links", () => {
    expect(detectLink("https://wa.me/34600112233")).toEqual({ kind: "whatsapp", value: "+34600112233" });
    expect(detectLink("https://api.whatsapp.com/send?phone=34600112233&text=hola")).toEqual({ kind: "whatsapp", value: "+34600112233" });
    expect(detectLink("https://web.whatsapp.com/send/?phone=34600112233")).toEqual({ kind: "whatsapp", value: "+34600112233" });
  });

  it("leaves group invites and short links as webs", () => {
    expect(detectLink("https://chat.whatsapp.com/ABC123456789xyz")?.kind).toBe("website");
    expect(detectLink("https://chat.whatsapp.com/1234567890123")?.kind).toBe("website");
    expect(detectLink("https://wa.me/message/ABCD1234567")?.kind).toBe("website");
    expect(detectLink("https://api.whatsapp.com/otra/34600112233")?.kind).toBe("website");
  });
});

describe("phones written with a (0) trunk prefix", () => {
  it("drop the (0) after the country code when dialling", () => {
    expect(dialDigits("+44 (0)20 7946 0958")).toBe("442079460958");
    expect(dialDigits("+44(0)20 7946 0958")).toBe("442079460958");
    expect(linkHref("phone", "+44 (0)20 7946 0958")).toBe("tel:+442079460958");
    expect(linkHref("whatsapp", "+44 (0)7700 900123")).toBe("https://wa.me/447700900123");
    expect(whatsappHrefForPhone("+49 (0)30 1234567")).toBe("https://wa.me/49301234567");
  });

  it("leave every other number as it was", () => {
    expect(linkHref("phone", "+34 612 345 678")).toBe("tel:+34612345678");
    expect(linkHref("phone", "+34 (91) 123 45 67")).toBe("tel:+34911234567");
    expect(linkHref("phone", "020 7946 0958")).toBe("tel:02079460958");
    expect(linkHref("phone", "(0)20 7946 0958")).toBe("tel:02079460958");
  });

  it("write the vCard TEL without it", () => {
    const card = { ...DEMO_CARD, links: [{ id: "uk", kind: "phone" as const, value: "+44 (0)20 7946 0958", visible: true }] };
    expect(buildVCard(card, { profileUrl: "https://getpassme.com/u/demo" })).toContain("TEL;TYPE=CELL:+442079460958\r\n");
  });
});

describe("pasted login codes", () => {
  it("picks the code out of a pasted line from the email", () => {
    expect(codeFromInput("12345678 (caduca en 10 min)", 8)).toBe("12345678");
    expect(codeFromInput("Caduca en 10 min: 12345678", 8)).toBe("12345678");
    expect(codeFromInput("Tu código es 1234 5678.", 8)).toBe("12345678");
    expect(codeFromInput("1234-5678", 8)).toBe("12345678");
  });

  it("keeps typing digit by digit as it was", () => {
    expect(codeFromInput("1", 8)).toBe("1");
    expect(codeFromInput("1234567", 8)).toBe("1234567");
    expect(codeFromInput("123456789", 8)).toBe("12345678");
    expect(codeFromInput("", 8)).toBe("");
  });

  it("is what the server's cleaning would have sent for a plain code", () => {
    for (const raw of ["12345678", "1234 5678", "Código: 12345678"]) expect(codeFromInput(raw, 8)).toBe(cleanCode(raw));
  });
});

describe("in-app browsers", () => {
  it("recognises Instagram, Facebook, LinkedIn and Android WebViews", () => {
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LinkedInApp")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36")).toBe(true);
  });

  it("leaves real browsers alone", () => {
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")).toBe(false);
    expect(isInAppBrowser(null)).toBe(false);
  });
});
