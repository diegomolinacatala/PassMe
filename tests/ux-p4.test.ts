import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as signOutRoute } from "@/app/auth/signout/route";
import { inboxFor, LOGIN_CODE_TTL_MS } from "@/lib/auth/code";
import { suggestEmailFix } from "@/lib/auth/email-typos";
import { CARD_THEMES, pickInitialTheme, themeFor } from "@/lib/card/design";
import { DEMO_CARD } from "@/lib/card/demo";
import { readStoredDraft, rememberDetails, resumableCode, writeStoredDraft, type StoredDraft } from "@/lib/card/draft-storage";
import { EMPTY_QUICK_DRAFT } from "@/lib/card/quick";
import { detectPlatform } from "@/lib/platform";

/** Block P4 of the 2026-10-05 UX audit (crear la tarjeta sin pasos de más). */

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

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

describe("P4.4 initial theme", () => {
  const demoTheme = themeFor(DEMO_CARD.accentColor, DEMO_CARD.detailColor)!;

  it("/crear?de=demo never starts with the demo card's theme", () => {
    for (let i = 0; i < 100; i++) {
      expect(pickInitialTheme(DEMO_CARD, () => i / 100).id).not.toBe(demoTheme.id);
    }
    // Edges of the random source, including a misbehaving one.
    for (const value of [0, 0.999999, 1, -1, Number.NaN]) {
      expect(pickInitialTheme(DEMO_CARD, () => value).id).not.toBe(demoTheme.id);
    }
  });

  it("can start with any of the ten themes when nobody referred them", () => {
    const seen = new Set(Array.from({ length: CARD_THEMES.length }, (_, i) => pickInitialTheme(null, () => i / CARD_THEMES.length).id));
    expect(seen.size).toBe(CARD_THEMES.length);
  });

  it("a referrer with a custom color excludes nothing", () => {
    const custom = { accentColor: "#123456", detailColor: "#ABCDEF" };
    expect(pickInitialTheme(custom, () => 0).id).toBe(CARD_THEMES[0]!.id);
  });
});

describe("P4.5 «Abrir Gmail» opens the app on an iPhone", () => {
  it("an iPhone and a @gmail.com address → googlegmail://", () => {
    expect(inboxFor("lucia@gmail.com", detectPlatform(IPHONE_UA))).toEqual({ name: "Gmail", url: "googlegmail://", app: true });
  });

  it("other addresses on an iPhone open Mail", () => {
    expect(inboxFor("lucia@hotmail.es", "ios")).toEqual({ name: "Mail", url: "message://", app: true });
    expect(inboxFor("lucia@empresa.com", "ios")?.url).toBe("message://");
  });

  it("Android and computers keep the webmail", () => {
    expect(inboxFor("lucia@gmail.com", detectPlatform(ANDROID_UA))).toMatchObject({ url: "https://mail.google.com/mail/u/0/#inbox", app: false });
    expect(inboxFor("lucia@gmail.com")?.app).toBe(false);
    expect(inboxFor("lucia@empresa.com", "android")).toBeNull();
  });
});

describe("P4.6 email typos", () => {
  it("suggests the provider they meant", () => {
    expect(suggestEmailFix("carlos@gmial.com")).toEqual({ email: "carlos@gmail.com", local: "carlos", domain: "gmail.com" });
    expect(suggestEmailFix("  Carlos.Ruiz@GMAI.COM ")?.email).toBe("Carlos.Ruiz@gmail.com");
    expect(suggestEmailFix("ana@hotmial.com")?.domain).toBe("hotmail.com");
    expect(suggestEmailFix("ana@outllok.com")?.domain).toBe("outlook.com");
    expect(suggestEmailFix("ana@yaho.es")?.domain).toBe("yahoo.es");
    expect(suggestEmailFix("ana@icloud.con")?.domain).toBe("icloud.com");
  });

  it("leaves right and unknown addresses alone", () => {
    for (const email of ["carlos@gmail.com", "ana@empresa.com", "ana@gmail.com.mx", "gmial.com", "@gmial.com", "", "a b@gmial.com"]) {
      expect(suggestEmailFix(email)).toBeNull();
    }
  });
});

describe("P4.2 / P4.3 stored draft", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  const base: Omit<StoredDraft, "savedAt"> = {
    draft: { ...EMPTY_QUICK_DRAFT, fullName: "Lucía" },
    pending: true,
    from: "demo",
    via: "qr",
    authEmail: "lucia@example.com",
    codeSentAt: 10_000,
    viaGoogle: false,
  };

  it("keeps when the code went out", () => {
    writeStoredDraft(base, 10_000);
    expect(readStoredDraft(20_000)?.codeSentAt).toBe(10_000);
  });

  it("reopens the code step only while the code works", () => {
    const stored: StoredDraft = { ...base, savedAt: 10_000 };
    expect(resumableCode(stored, 10_000 + 15_000)).toEqual({ email: "lucia@example.com", sentAt: 10_000, resendIn: 45 });
    expect(resumableCode(stored, 10_000 + 90_000)?.resendIn).toBe(0);
    expect(resumableCode(stored, 10_000 + LOGIN_CODE_TTL_MS)).toBeNull();
    // A clock that went backwards, nothing asked for, or no code: the form.
    expect(resumableCode(stored, 5_000)).toBeNull();
    expect(resumableCode({ ...stored, pending: false }, 20_000)).toBeNull();
    expect(resumableCode({ ...stored, authEmail: null }, 20_000)).toBeNull();
    expect(resumableCode({ ...stored, codeSentAt: null }, 20_000)).toBeNull();
    expect(resumableCode(null)).toBeNull();
  });

  it("details left on a card don't pick the color: /crear does", () => {
    rememberDetails({ fullName: "Lucía" }, "demo", "qr", 1_000);
    expect(readStoredDraft(1_000)?.draft.theme).toBe("");
  });
});

describe("D3 «Cerrar sesión y entrar con ese»", () => {
  function signOut(fields: Record<string, string> | null) {
    const url = "https://getpassme.com/auth/signout";
    return signOutRoute(fields ? new NextRequest(url, { method: "POST", body: new URLSearchParams(fields) }) : new NextRequest(url, { method: "POST" }));
  }

  it("lands on /login to come back with another email", async () => {
    const response = await signOut({ next: "/login" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://getpassme.com/login");
  });

  it("never leaves the site", async () => {
    for (const next of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      expect((await signOut({ next })).headers.get("location")).toBe("https://getpassme.com/");
    }
    expect((await signOut(null)).headers.get("location")).toBe("https://getpassme.com/");
  });
});
