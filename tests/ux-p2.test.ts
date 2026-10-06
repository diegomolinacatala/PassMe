import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import manifest from "@/app/manifest";
import { GET as qrRoute } from "@/app/u/[slug]/qr/route";
import { announce, LIVE_REGION_ID } from "@/lib/announce";
import { hasSupabaseAuthCookie } from "@/lib/auth/session-cookie";
import { parseSignOutScope } from "@/lib/auth/signout";
import { DEMO_CARD } from "@/lib/card/demo";
import { canSendCard, sendCardDetails, sentDetailsSentence } from "@/lib/card/send-card";
import type { CardLink } from "@/lib/card/types";
import { isGoogleWalletLive } from "@/lib/config.server";
import { encodeIco } from "@/lib/ico";
import {
  CONTACTS_SEEN_COOKIE,
  contactsNotice,
  meetingsNotice,
  needsOwnerAnswer,
  newestCreatedAt,
  parseSeenCookie,
  seenCookie,
  unseenContacts,
} from "@/lib/pending";
import { homeScreenHint, phoneWalletAction } from "@/lib/platform";

/** Block P2 of the 2026-10-05 UX audit («Mi QR» y la vuelta al producto). */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Google Wallet switch (GOOGLE_WALLET_LIVE)", () => {
  it("is off unless explicitly turned on", () => {
    vi.stubEnv("GOOGLE_WALLET_LIVE", "");
    expect(isGoogleWalletLive()).toBe(false);
    vi.stubEnv("GOOGLE_WALLET_LIVE", "1");
    expect(isGoogleWalletLive()).toBe(false);
    vi.stubEnv("GOOGLE_WALLET_LIVE", "TRUE ");
    expect(isGoogleWalletLive()).toBe(false);
  });

  it("is on with GOOGLE_WALLET_LIVE=true", () => {
    vi.stubEnv("GOOGLE_WALLET_LIVE", "true");
    expect(isGoogleWalletLive()).toBe(true);
  });
});

describe("wallet per platform", () => {
  it("offers this phone's own wallet, or the full-screen QR", () => {
    expect(phoneWalletAction("ios", { apple: true, google: true })).toBe("apple");
    expect(phoneWalletAction("ios", { apple: false, google: true })).toBe("qr");
    expect(phoneWalletAction("android", { apple: true, google: true })).toBe("google");
    // Google Wallet switched off: Android gets "Guardar mi QR en el móvil", never Apple.
    expect(phoneWalletAction("android", { apple: true, google: false })).toBe("qr");
    expect(phoneWalletAction("other", { apple: true, google: true })).toBeNull();
  });

  it("explains how to pin «Mi QR» to the home screen where it helps", () => {
    expect(homeScreenHint("ios", false)).toBe("Añádela a tu pantalla de inicio: Compartir → Añadir a pantalla de inicio");
    expect(homeScreenHint("ios", true)).toMatch(/Compartir → Añadir a pantalla de inicio/);
    expect(homeScreenHint("android", false)).toBe("Añádela a tu pantalla de inicio: ⋮ → Añadir a pantalla de inicio");
    expect(homeScreenHint("android", true)).toBeNull();
    expect(homeScreenHint("other", false)).toBeNull();
  });
});

describe("session cookie hint", () => {
  it("recognizes Supabase's session cookie, also when chunked", () => {
    expect(hasSupabaseAuthCookie(["sb-abcdefgh-auth-token"])).toBe(true);
    expect(hasSupabaseAuthCookie(["theme", "sb-abc-def-auth-token.0", "sb-abc-def-auth-token.1"])).toBe(true);
  });

  it("ignores everything else, including the PKCE verifier", () => {
    expect(hasSupabaseAuthCookie([])).toBe(false);
    expect(hasSupabaseAuthCookie(["sb-abc-auth-token-code-verifier"])).toBe(false);
    expect(hasSupabaseAuthCookie(["auth-token", "sb--auth-token", "xsb-abc-auth-token"])).toBe(false);
  });
});

describe("sign-out scope", () => {
  it("signs out this device unless every device is asked for", () => {
    expect(parseSignOutScope("global")).toBe("global");
    expect(parseSignOutScope("local")).toBe("local");
    expect(parseSignOutScope(null)).toBe("local");
    expect(parseSignOutScope("others")).toBe("local");
    expect(parseSignOutScope(["global"])).toBe("local");
  });
});

describe("pending notices", () => {
  const awaiting = { stage: "awaiting", actions: ["confirm", "counter", "decline"] };

  it("only counts proposals waiting for the owner's answer", () => {
    expect(needsOwnerAnswer(awaiting)).toBe(true);
    expect(needsOwnerAnswer({ stage: "awaiting", actions: ["cancel"] })).toBe(false);
    expect(needsOwnerAnswer({ stage: "confirmed", actions: ["cancel"] })).toBe(false);
  });

  it("names a single proposal and links straight to its answer", () => {
    expect(meetingsNotice([])).toBeNull();
    expect(meetingsNotice([{ name: "Lucía Martín", href: "/reunion/x/y" }])).toEqual({
      id: "meetings",
      lead: "Lucía Martín",
      text: "te ha propuesto una reunión",
      action: "Responder",
      href: "/reunion/x/y",
    });
    expect(meetingsNotice([{ name: "Lucía Martín", href: null }])?.href).toBe("#reuniones");
    expect(meetingsNotice([{ name: "A", href: "/a" }, { name: "B", href: "/b" }])).toMatchObject({
      lead: null,
      text: "Tienes 2 propuestas de reunión",
      action: "Ver",
      href: "#reuniones",
    });
  });

  it("counts contacts newer than the last «Ver»", () => {
    const contacts = [
      { name: "Javier", createdAt: "2026-10-05T10:00:00.000Z" },
      { name: "Ana", createdAt: "2026-10-01T10:00:00.000Z" },
    ];
    expect(unseenContacts(contacts, null)).toHaveLength(2);
    expect(unseenContacts(contacts, "not a date")).toHaveLength(2);
    expect(unseenContacts(contacts, "2026-10-03T00:00:00.000Z").map((c) => c.name)).toEqual(["Javier"]);
    expect(unseenContacts(contacts, "2026-10-05T10:00:00.000Z")).toEqual([]);
    expect(newestCreatedAt(contacts)).toBe("2026-10-05T10:00:00.000Z");
    expect(newestCreatedAt([])).toBeNull();
    expect(contactsNotice([{ name: "Javier" }])).toMatchObject({ lead: "Javier", text: "te ha dejado su contacto", action: "Ver", href: "#contactos" });
    expect(contactsNotice(contacts)).toMatchObject({ lead: null, text: "Te han dejado 2 contactos" });
    expect(contactsNotice([])).toBeNull();
  });
});

describe("contacts seen (cookie read on the server)", () => {
  it("only trusts real dates", () => {
    expect(parseSeenCookie("2026-10-05T10:00:00.000Z")).toBe("2026-10-05T10:00:00.000Z");
    expect(parseSeenCookie(undefined)).toBeNull();
    expect(parseSeenCookie("")).toBeNull();
    expect(parseSeenCookie("yesterday")).toBeNull();
    expect(parseSeenCookie(`2026-10-05${"x".repeat(60)}`)).toBeNull();
  });

  it("is scoped to the editor and lasts a year", () => {
    expect(seenCookie("2026-10-05T10:00:00.000Z", true)).toBe(
      `${CONTACTS_SEEN_COOKIE}=2026-10-05T10:00:00.000Z; Path=/dashboard; Max-Age=31536000; SameSite=Lax; Secure`,
    );
    expect(seenCookie("2026-10-05T10:00:00.000Z", false)).not.toContain("Secure");
  });
});

describe("«Mandarle mi tarjeta»", () => {
  const link = (kind: CardLink["kind"], value: string, visible = true): CardLink => ({ id: `l-${kind}-${value.length}`, kind, value, visible });
  const card = (links: CardLink[]) => ({ fullName: "Lucía Ferrer", company: "Mirador", links });

  it("sends what the card shows, with a fixed message and the card's link", () => {
    const details = sendCardDetails(
      card([link("linkedin", "lucia"), link("email", "lucia@mirador.es"), link("phone", "+34 611 22 33 44")]),
      "login@example.com",
      "https://getpassme.com/u/lucia-ferrer",
    );
    expect(details).toEqual({
      name: "Lucía Ferrer",
      email: "lucia@mirador.es",
      phone: "+34 611 22 33 44",
      company: "Mirador",
      message: "Ha creado su tarjeta de PassMe desde la tuya.\nEsta es: https://getpassme.com/u/lucia-ferrer",
    });
  });

  it("never sends a hidden email or phone", () => {
    const details = sendCardDetails(card([link("email", "secret@x.es", false), link("phone", "+34 600 000 000", false)]), "login@x.es", "u");
    expect(details.email).toBe("");
    expect(details.phone).toBe("");
    expect(canSendCard(details)).toBe(false);
  });

  it("uses the sign-in email only when the card has no email at all, and WhatsApp as a phone", () => {
    const details = sendCardDetails(card([link("whatsapp", "+34 699 11 22 33")]), "lucia@example.com", "u");
    expect(details.email).toBe("lucia@example.com");
    expect(details.phone).toBe("+34 699 11 22 33");
    expect(canSendCard(details)).toBe(true);
  });

  it("tells exactly what the other person will see", () => {
    expect(sentDetailsSentence("Alex", { email: "a@b.es", phone: "+34 6" })).toBe("Alex verá tu nombre, tu email y tu móvil.");
    expect(sentDetailsSentence("Alex", { email: "a@b.es", phone: "" })).toBe("Alex verá tu nombre y tu email.");
    expect(sentDetailsSentence("Alex", { email: "", phone: "+34 6" })).toBe("Alex verá tu nombre y tu móvil.");
    expect(sentDetailsSentence("Alex", { email: "", phone: "" })).toBe("Alex verá tu nombre.");
  });

  it("works from the demo card (its visible mobile, never the hidden phone)", () => {
    const details = sendCardDetails(DEMO_CARD, null, "u");
    expect(details.email).toBe("alex@example.com");
    expect(details.phone).toBe("+34 612 345 678");
  });
});

describe("favicon.ico writer", () => {
  it("writes an ICONDIR with one PNG entry per size", () => {
    const small = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const big = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]);
    const ico = encodeIco([
      { size: 16, png: small },
      { size: 256, png: big },
    ]);
    const view = new DataView(ico.buffer);
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([0, 1, 2]);
    // Entry 1: 16×16, 32 bpp, its bytes right after the directory.
    expect([ico[6], ico[7], view.getUint16(10, true), view.getUint16(12, true)]).toEqual([16, 16, 1, 32]);
    expect(view.getUint32(14, true)).toBe(small.length);
    expect(view.getUint32(18, true)).toBe(6 + 16 * 2);
    // Entry 2: 256 is written as 0.
    expect([ico[22], ico[23]]).toEqual([0, 0]);
    expect(view.getUint32(34, true)).toBe(6 + 32 + small.length);
    expect(Array.from(ico.slice(38, 38 + small.length))).toEqual(Array.from(small));
    expect(ico.length).toBe(6 + 32 + small.length + big.length);
  });

  it("refuses impossible sizes and empty icons", () => {
    expect(() => encodeIco([])).toThrow();
    expect(() => encodeIco([{ size: 512, png: new Uint8Array(1) }])).toThrow();
  });
});

describe("live region", () => {
  it("announces through the layout's region, emptied first so repeats are read again", () => {
    vi.useFakeTimers();
    const region = { textContent: "old" };
    vi.stubGlobal("document", { getElementById: (id: string) => (id === LIVE_REGION_ID ? region : null) });
    announce("Enlace copiado");
    expect(region.textContent).toBe("");
    vi.advanceTimersByTime(100);
    expect(region.textContent).toBe("Enlace copiado");
    vi.advanceTimersByTime(6000);
    expect(region.textContent).toBe("");
  });

  it("does nothing without a document (server)", () => {
    expect(() => announce("x")).not.toThrow();
  });
});

describe("web app manifest", () => {
  it("opens on «Mi QR», standalone, in the paper color, with installable icons", () => {
    const m = manifest();
    expect(m).toMatchObject({ name: "PassMe", short_name: "PassMe", start_url: "/dashboard/qr", display: "standalone" });
    expect(m.background_color).toBe("#f3efe6");
    expect(m.theme_color).toBe("#f3efe6");
    expect(m.icons?.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  });
});

describe("printable QR", () => {
  const get = (query = "") =>
    qrRoute(new NextRequest(`http://localhost/u/demo/qr${query}`), { params: Promise.resolve({ slug: "demo" }) });

  it("keeps the SVG by default", async () => {
    const response = await get();
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(response.headers.get("content-disposition")).toContain('filename="passme-demo-qr.svg"');
  });

  it("renders a 1024 px PNG with ?format=png", async () => {
    const response = await get("?format=png");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toContain('filename="passme-demo-qr.png"');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(bytes.buffer);
    // PNG signature, then the IHDR chunk: width and height.
    expect(Array.from(bytes.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1024, 1024]);
  });
});
