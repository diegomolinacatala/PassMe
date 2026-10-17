import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Which libraries the browser downloads for a page, read from the import graph.
 * zod alone is about 91 KB gzip (364 KB raw): the public card, the landing and
 * /crear don't validate with it, so none of their client code may reach it. The
 * same goes for qrcode (34 KB, the QR is drawn on the server) and the Supabase
 * client (only the editor's photo upload needs it, and loads it on demand).
 *
 * Dynamic import() calls are not followed: that is the point of them.
 */

const SRC = path.join(process.cwd(), "src");
const HEAVY = ["zod", "qrcode", "@supabase/ssr", "@supabase/supabase-js"];

const sources = new Map<string, string>();
function read(file: string): string {
  let text = sources.get(file);
  if (text === undefined) {
    text = readFileSync(file, "utf8");
    sources.set(file, text);
  }
  return text;
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  return ["", ".ts", ".tsx", "/index.ts", "/index.tsx"].map((ext) => base + ext).find((candidate) => existsSync(candidate) && /\.(ts|tsx)$/.test(candidate)) ?? null;
}

interface Import {
  spec: string;
}

/** Static imports and re-exports that survive compilation (type-only ones are erased). */
function importsOf(file: string): Import[] {
  const found: Import[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s+([^;'"]*?)\s+from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  for (const match of read(file).matchAll(pattern)) {
    const clause = match[1];
    if (clause !== undefined) {
      if (/^type\s/.test(clause)) continue;
      const named = /^\{([^}]*)\}$/.exec(clause);
      if (named && named[1]!.split(",").map((part) => part.trim()).filter(Boolean).every((part) => part.startsWith("type "))) continue;
    }
    found.push({ spec: (match[2] ?? match[3])! });
  }
  return found;
}

const directive = (file: string, name: string) => new RegExp(`^\\s*["']${name}["']`).test(read(file));

/** The packages the browser gets for a route: everything reachable from its "use client" modules. */
function clientPackages(page: string): Map<string, string> {
  const packages = new Map<string, string>();
  const seenServer = new Set<string>();
  const seenClient = new Set<string>();

  const walkClient = (file: string, via: string) => {
    if (seenClient.has(file)) return;
    seenClient.add(file);
    for (const { spec } of importsOf(file)) {
      const target = resolve(file, spec);
      if (target) {
        if (!directive(target, "use server")) walkClient(target, via);
        continue;
      }
      const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!;
      if (!packages.has(name)) packages.set(name, `${via} -> ${path.relative(SRC, file).replaceAll("\\", "/")}`);
    }
  };
  const walkServer = (file: string) => {
    if (seenServer.has(file)) return;
    seenServer.add(file);
    for (const { spec } of importsOf(file)) {
      const target = resolve(file, spec);
      if (!target || directive(target, "use server")) continue;
      if (directive(target, "use client")) walkClient(target, path.relative(SRC, target).replaceAll("\\", "/"));
      else walkServer(target);
    }
  };

  walkServer(path.join(SRC, "app/layout.tsx"));
  walkServer(path.join(SRC, page));
  return packages;
}

describe("what the browser downloads", () => {
  it.each([
    ["the landing", "app/page.tsx"],
    ["the public card", "app/u/[slug]/page.tsx"],
    ["/crear", "app/crear/page.tsx"],
    ["/login", "app/login/page.tsx"],
    ["the meeting page", "app/reunion/[id]/[sig]/page.tsx"],
  ])("%s has no zod, qrcode or Supabase client in its client code", (_name, page) => {
    const packages = clientPackages(page);
    const heavy = HEAVY.filter((name) => packages.has(name)).map((name) => `${name} (via ${packages.get(name)})`);
    expect(heavy).toEqual([]);
  });

  it("the walker sees the packages client code does import", () => {
    // Guards the guard: if the parsing broke, the checks above would pass for nothing.
    const packages = clientPackages("app/page.tsx");
    expect([...packages.keys()]).toEqual(expect.arrayContaining(["react", "next", "lucide-react", "clsx", "tailwind-merge"]));
  });

  it("the editor loads zod and the Supabase client on demand only", () => {
    // The editor still draws handoff QRs in the browser (wallet and welcome panels), so qrcode may stay.
    const packages = clientPackages("app/dashboard/page.tsx");
    const heavy = HEAVY.filter((name) => name !== "qrcode" && packages.has(name)).map((name) => `${name} (via ${packages.get(name)})`);
    expect(heavy).toEqual([]);
  });
});
