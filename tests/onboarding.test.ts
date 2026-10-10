import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanCode, formatCountdown, inboxFor, retryAfterSeconds } from "@/lib/auth/code";
import { clearStoredDraft, DRAFT_TTL_MS, readStoredDraft, rememberDetails, writeStoredDraft } from "@/lib/card/draft-storage";
import {
  coerceQuickDraft,
  createPath,
  EMPTY_QUICK_DRAFT,
  parseFromSlug,
  parseQuickDraft,
  parseVia,
  quickDraftToCardInput,
  quickDraftToPublicCard,
  welcomePath,
} from "@/lib/card/quick";
import { parseCardInput } from "@/lib/card/schema";
import { draftFallbackPath, parseDraftJson, parseOrigin } from "@/lib/onboarding";
import { detectPlatform } from "@/lib/platform";

describe("login codes", () => {
  it("keeps only the digits of a typed or pasted code", () => {
    expect(cleanCode("1234 5678")).toBe("12345678");
    expect(cleanCode("Código: 12-34-56-78")).toBe("12345678");
    expect(cleanCode("123456789012345")).toHaveLength(10);
  });

  it("reads how long Supabase wants us to wait", () => {
    expect(retryAfterSeconds("For security purposes, you can only request this after 42 seconds.")).toBe(42);
    expect(retryAfterSeconds("after 1 second")).toBe(1);
    expect(retryAfterSeconds("email rate limit exceeded")).toBeNull();
    expect(retryAfterSeconds(undefined)).toBeNull();
    expect(retryAfterSeconds("after 99999 seconds")).toBeNull();
  });

  it("links to the inbox of well-known providers only", () => {
    expect(inboxFor("Ana@Gmail.com")?.name).toBe("Gmail");
    expect(inboxFor("x@hotmail.es")?.name).toBe("Outlook");
    expect(inboxFor("x@icloud.com")?.url).toMatch(/^https:\/\//);
    expect(inboxFor("x@empresa.com")).toBeNull();
    expect(inboxFor("no-at-sign")).toBeNull();
  });

  it("formats the resend countdown", () => {
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(9.2)).toBe("0:10");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});

const VALID = {
  fullName: "  José   Núñez ",
  headline: "CEO",
  company: "",
  phone: "",
  email: "Jose@Example.com",
  linkedin: "jose-nunez",
  theme: "salvia",
  patternSeed: 1234,
};

describe("quick card draft", () => {
  it("normalizes a valid draft", () => {
    const parsed = parseQuickDraft(VALID);
    expect(parsed).toEqual({
      ok: true,
      data: {
        fullName: "José Núñez",
        headline: "CEO",
        company: "",
        phone: "",
        email: "jose@example.com",
        linkedin: "https://www.linkedin.com/in/jose-nunez",
        theme: "salvia",
        patternSeed: 1234,
        pattern: "arco",
        typeface: "clasica",
      },
    });
  });

  it("asks for a name and at least one way to reach you", () => {
    const parsed = parseQuickDraft({ ...EMPTY_QUICK_DRAFT });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.fullName).toBe("Tu nombre es obligatorio.");
    expect(parsed.errors.contact).toMatch(/al menos un teléfono/);
  });

  it("reports invalid contacts on their own field", () => {
    const parsed = parseQuickDraft({ ...VALID, phone: "abc", email: "nope" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.phone).toBeDefined();
    expect(parsed.errors.email).toBe("Email no válido.");
    expect(parsed.errors.contact).toBeUndefined();
  });

  it("coerces anything into a draft and falls back to the default theme", () => {
    expect(coerceQuickDraft(null)).toEqual(EMPTY_QUICK_DRAFT);
    expect(coerceQuickDraft({ fullName: 42, theme: 5, patternSeed: -1 })).toEqual(EMPTY_QUICK_DRAFT);
    const parsed = parseQuickDraft({ ...VALID, theme: "neon" });
    expect(parsed.ok && parsed.data.theme).toBe(EMPTY_QUICK_DRAFT.theme);
  });

  it("becomes a card the editor schema accepts", () => {
    const parsed = parseQuickDraft(VALID);
    if (!parsed.ok) throw new Error("invalid fixture");
    const input = quickDraftToCardInput(parsed.data, { slug: "jose-nunez", linkId: (i) => `l-test${i}xx` });
    const card = parseCardInput(input);
    expect(card.ok).toBe(true);
    if (!card.ok) return;
    expect(card.data).toMatchObject({ slug: "jose-nunez", isPublished: true, accentColor: "#CDD5BD", patternSeed: 1234 });
    expect(card.data.links.map((l) => l.kind)).toEqual(["email", "linkedin"]);
  });

  it("previews only the contacts that are already valid", () => {
    const preview = quickDraftToPublicCard({ ...EMPTY_QUICK_DRAFT, fullName: "Ana", phone: "12", email: "ana@example.com" });
    expect(preview.slug).toBe("ana");
    expect(preview.links.map((l) => l.kind)).toEqual(["email"]);
    expect(quickDraftToPublicCard(EMPTY_QUICK_DRAFT).slug).toBe("tu-nombre");
  });

  it("builds the /crear and welcome paths around a valid origin", () => {
    expect(parseFromSlug(" Alex ")).toBe("alex");
    expect(parseFromSlug("demo")).toBe("demo");
    expect(parseFromSlug("../x")).toBeNull();
    expect(parseFromSlug(["alex"])).toBeNull();
    expect(createPath("alex")).toBe("/crear?de=alex");
    expect(createPath(null)).toBe("/crear");
    expect(welcomePath("alex")).toBe("/dashboard?nueva=1&de=alex");
    expect(welcomePath(null)).toBe("/dashboard?nueva=1");
  });

  it("carries how the referrer's card was reached, only alongside the card", () => {
    expect(parseVia("qr")).toBe("qr");
    expect(parseVia("share")).toBe("share");
    expect(parseVia("direct")).toBe("direct");
    expect(parseVia("crear")).toBe("direct");
    expect(parseVia(["qr"])).toBe("direct");
    expect(parseVia(undefined)).toBe("direct");
    expect(createPath("alex", "qr")).toBe("/crear?de=alex&via=qr");
    expect(createPath("alex", "share")).toBe("/crear?de=alex&via=share");
    expect(createPath("alex", "direct")).toBe("/crear?de=alex");
    expect(createPath(null, "qr")).toBe("/crear");
    expect(welcomePath("alex", "qr")).toBe("/dashboard?nueva=1&de=alex&via=qr");
    expect(welcomePath("alex", "share")).toBe("/dashboard?nueva=1&de=alex&via=share");
    expect(welcomePath(null, "share")).toBe("/dashboard?nueva=1");
  });

  it("validates an origin coming from a form field or an action argument", () => {
    expect(parseOrigin("Alex", "qr")).toEqual({ from: "alex", via: "qr" });
    expect(parseOrigin("alex", "evil")).toEqual({ from: "alex", via: "direct" });
    expect(parseOrigin("../x", "qr")).toEqual({ from: null, via: "direct" });
    expect(parseOrigin(null, "share")).toEqual({ from: null, via: "direct" });
    expect(draftFallbackPath({ from: "alex", via: "share" })).toBe("/crear?de=alex&via=share");
  });

  it("parses draft JSON from a form field defensively", () => {
    expect(parseDraftJson(JSON.stringify(VALID))).toEqual(VALID);
    expect(parseDraftJson("{nope")).toBeNull();
    expect(parseDraftJson("")).toBeNull();
    expect(parseDraftJson(null)).toBeNull();
    expect(parseDraftJson("x".repeat(5000))).toBeNull();
  });
});

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

describe("stored draft", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips and expires", () => {
    const draft = { ...EMPTY_QUICK_DRAFT, fullName: "Ana" };
    writeStoredDraft({ draft, pending: true, from: "alex", via: "share", authEmail: "ana@example.com", codeSentAt: null, viaGoogle: false }, 1_000);
    expect(readStoredDraft(1_000 + 60_000)).toMatchObject({ draft, pending: true, from: "alex", via: "share", authEmail: "ana@example.com" });
    expect(readStoredDraft(1_000 + DRAFT_TTL_MS + 1)).toBeNull();
    // Expired drafts are removed, not just ignored.
    expect(readStoredDraft(1_000)).toBeNull();
  });

  it("merges details typed elsewhere without wiping the rest", () => {
    writeStoredDraft(
      { draft: { ...EMPTY_QUICK_DRAFT, headline: "CEO", theme: "cafe" }, pending: false, from: null, via: "direct", authEmail: null, codeSentAt: null, viaGoogle: false },
      1_000,
    );
    rememberDetails({ fullName: "Ana", email: "ana@example.com", phone: "", company: "Norte" }, "alex", "qr", 2_000);
    expect(readStoredDraft(2_000)).toMatchObject({
      draft: { fullName: "Ana", email: "ana@example.com", phone: "", company: "Norte", headline: "CEO", theme: "cafe" },
      pending: false,
      from: "alex",
      via: "qr",
    });
    clearStoredDraft();
    expect(readStoredDraft(2_000)).toBeNull();
  });

  it("ignores garbage and blocked storage", () => {
    localStorage.setItem("passme:quick-draft", "{broken");
    expect(readStoredDraft()).toBeNull();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readStoredDraft()).toBeNull();
    expect(() =>
      writeStoredDraft({ draft: EMPTY_QUICK_DRAFT, pending: false, from: null, via: "direct", authEmail: null, codeSentAt: null, viaGoogle: false }),
    ).not.toThrow();
    expect(() => clearStoredDraft()).not.toThrow();
  });
});

describe("platform", () => {
  it("tells phones apart by their wallet", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("other");
    expect(detectPlatform(null)).toBe("other");
  });
});
