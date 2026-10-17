import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkNewSlug,
  checkSlug,
  NEWLY_RESERVED_PREFIX,
  NEWLY_RESERVED_SLUGS,
  RESERVED_SLUGS,
  slugAlternatives,
  slugCandidate,
  suggestSlug,
} from "@/lib/card/slug";

/** src/lib/card/slug.ts against the SQL that enforces the same lists. */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const read = (file: string) => readFileSync(join(MIGRATIONS, file), "utf8");
const AUDIT = read("20261017120000_security_audit.sql");

/** The quoted words of the first `array[...]` that follows `marker`. */
function wordsAfter(sql: string, marker: string): string[] {
  const start = sql.indexOf(marker);
  expect(start, marker).toBeGreaterThan(-1);
  const array = /array\[([^\]]*)\]/.exec(sql.slice(start));
  expect(array, `array after ${marker}`).not.toBeNull();
  return [...array![1]!.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!).sort();
}

describe("the reserved handles in slug.ts and in SQL", () => {
  it("launch-time words: the CHECK, is_slug_available and RESERVED_SLUGS list the same ones", () => {
    const expected = [...RESERVED_SLUGS].sort();
    expect(wordsAfter(read("20260927120000_init.sql"), "profiles_slug_not_reserved")).toEqual(expected);
    expect(wordsAfter(AUDIT, "create or replace function public.is_slug_available")).toEqual(expected);
  });

  it("newly reserved words and prefix: slug_is_newly_reserved and NEWLY_RESERVED_* agree", () => {
    const fn = AUDIT.slice(AUDIT.indexOf("create or replace function public.slug_is_newly_reserved"));
    expect(wordsAfter(fn, "slug_is_newly_reserved")).toEqual([...NEWLY_RESERVED_SLUGS].sort());
    expect(/like '([a-z-]+)%'/.exec(fn)?.[1]).toBe(NEWLY_RESERVED_PREFIX);
    expect([...NEWLY_RESERVED_SLUGS].sort()).toEqual([
      "aviso-legal", "ayuda", "crear", "equipo", "getpassme", "hola", "oficial",
      "privacidad", "reunion", "seguridad", "soporte", "terminos",
    ]);
  });

  it("no newly reserved word is also a launch-time one (each list has one home)", () => {
    for (const word of NEWLY_RESERVED_SLUGS) expect(RESERVED_SLUGS.has(word), word).toBe(false);
  });
});

describe("checkSlug and checkNewSlug", () => {
  it("checkSlug still accepts the newly reserved words: handles that exist keep working", () => {
    for (const word of NEWLY_RESERVED_SLUGS) expect(checkSlug(word), word).toEqual({ ok: true });
    expect(checkSlug("passme-pro")).toEqual({ ok: true });
    expect(checkSlug("dashboard")).toEqual({ ok: false, reason: "reserved" });
  });

  it("checkNewSlug refuses them, the passme- prefix included, and keeps the other rules", () => {
    for (const word of NEWLY_RESERVED_SLUGS) expect(checkNewSlug(word), word).toEqual({ ok: false, reason: "reserved" });
    for (const slug of ["passme-pro", "passme-soporte", "passme-1"]) expect(checkNewSlug(slug), slug).toEqual({ ok: false, reason: "reserved" });
    for (const slug of ["passmeteam", "mi-passme", "equipo-azul", "hola-mundo", "alex-rivera"]) expect(checkNewSlug(slug), slug).toEqual({ ok: true });
    expect(checkNewSlug("dashboard")).toEqual({ ok: false, reason: "reserved" });
    expect(checkNewSlug("ab")).toEqual({ ok: false, reason: "length" });
    expect(checkNewSlug("Hola")).toEqual({ ok: false, reason: "format" });
  });
});

describe("handles made for new cards", () => {
  it("suggestSlug leaves out names that can't be claimed", () => {
    expect(suggestSlug("Soporte")).toBeNull();
    expect(suggestSlug("Hola")).toBeNull();
    expect(suggestSlug("PassMe Team")).toBeNull();
    expect(suggestSlug("José Núñez")).toBe("jose-nunez");
  });

  it("slugCandidate never builds a passme- handle", () => {
    expect(slugCandidate("PassMe Team", "k3v9")).toBe("team-k3v9");
    expect(slugCandidate("passme", "k3v9")).toBe("tarjeta-k3v9");
    expect(slugCandidate("passme@example.com", "k3v9")).toBe("tarjeta-k3v9");
    expect(slugCandidate("passmeteam", "k3v9")).toBe("passmeteam-k3v9");
    for (const seed of ["PassMe Team", "passme", "Soporte", "Hola", "ana"]) {
      expect(checkNewSlug(slugCandidate(seed, "k3v9")).ok, seed).toBe(true);
    }
  });

  it("slugAlternatives never offers one", () => {
    const alternatives = slugAlternatives("soporte-2");
    expect(alternatives).not.toContain("soporte");
    expect(alternatives.length).toBeGreaterThan(0);
    for (const candidate of alternatives) expect(checkNewSlug(candidate).ok, candidate).toBe(true);
  });
});
