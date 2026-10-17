import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactRequest } from "@/lib/card/contact";

/*
 * /dashboard/contactos: what the owner downloads, and what they are told when
 * the list couldn't be read (an empty file would say "nobody wrote").
 */

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string | null } | null,
  list: { available: true, requests: [] } as { available: boolean; requests: unknown[]; failed?: true },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ marker: "client" }),
  getSessionUser: async () => state.user,
}));
vi.mock("@/lib/data/contact-requests", () => ({ listOwnContactRequests: async () => state.list }));

const { GET } = await import("@/app/dashboard/contactos/route");

const request = (id: string, name: string): ContactRequest => ({
  id,
  name,
  email: "alguien@example.com",
  phone: null,
  company: "",
  message: "",
  source: "qr",
  createdAt: "2026-10-01T10:00:00Z",
});

const get = (query: string, headers: Record<string, string> = {}) =>
  GET(new NextRequest(`https://getpassme.com/dashboard/contactos${query}`, { headers }));

beforeEach(() => {
  state.user = { id: "owner", email: null };
  state.list = { available: true, requests: [] };
});

describe("when the contacts can't be read", () => {
  it("answers 503 with a message, never an empty file", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.list = { available: true, requests: [], failed: true };
    for (const query of ["?format=csv", "?format=vcf", "?format=vcf&id=abc"]) {
      const response = await get(query);
      expect(response.status, query).toBe(503);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.text()).toMatch(/No hemos podido cargar tus contactos/);
    }
  });

  it("still exports normally when there are none", async () => {
    const response = await get("?format=csv");
    expect(response.status).toBe(200);
  });
});

describe("file names", () => {
  it("strip accents before slugging: José Núñez → Jose-Nunez", async () => {
    state.list = { available: true, requests: [request("c1", "José Núñez")] };
    const response = await get("?format=vcf&id=c1");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Jose-Nunez.vcf"');
  });

  it.each([
    ["Ñandú Ibáñez", "Nandu-Ibanez.vcf"],
    ["Zoë Müller-Åkesson", "Zoe-Muller-Akesson.vcf"],
    ["María   del  Carmen", "Maria-del-Carmen.vcf"],
    ["  ---  ", "contacto.vcf"],
    ["王小明", "contacto.vcf"],
  ])("%s → %s", async (name, file) => {
    state.list = { available: true, requests: [request("c1", name)] };
    const response = await get("?format=vcf&id=c1");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${file}"`);
  });

  it("uses a fixed name for the whole list and a dated one for the spreadsheet", async () => {
    state.list = { available: true, requests: [request("c1", "José Núñez"), request("c2", "Ana")] };
    expect((await get("?format=vcf")).headers.get("content-disposition")).toBe('attachment; filename="passme-contactos.vcf"');
    expect((await get("?format=csv")).headers.get("content-disposition")).toMatch(/^attachment; filename="passme-contactos-\d{4}-\d{2}-\d{2}\.csv"$/);
  });
});

describe("access", () => {
  it("sends a visitor following the link to the login, and a script gets 401", async () => {
    state.user = null;
    const navigation = await get("?format=csv", { "sec-fetch-mode": "navigate" });
    expect(navigation.status).toBe(303);
    expect(new URL(navigation.headers.get("location")!).pathname).toBe("/login");
    expect((await get("?format=csv")).status).toBe(401);
  });

  it("a contact that isn't there is a 404", async () => {
    state.list = { available: true, requests: [request("c1", "Ana")] };
    expect((await get("?format=vcf&id=nope")).status).toBe(404);
  });
});
