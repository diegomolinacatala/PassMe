import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Safari before 16.4 (iOS 15 and 16.0-16.3) treats a regex literal with a
 * lookbehind as an early SyntaxError: the whole script that contains it fails
 * to compile. The meeting schema's date/time regexes used to have one and sat
 * in the chunk shared by the landing, the public card and /crear, which took
 * those pages down on those phones. Nothing the browser can reach may use one.
 */

const ROOT = process.cwd();
const SCANNED = ["src/lib", "src/components", "src/app"];
const LOOKBEHIND = /\(\?<[=!]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("code the browser can reach", () => {
  const files = SCANNED.flatMap((dir) => sourceFiles(path.join(ROOT, dir)));

  it("scans the source tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no regex lookbehind (Safari < 16.4 cannot even parse it)", () => {
    const offenders = files
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        // Server-only modules never reach a browser, so they may use whatever Node supports.
        if (/import\s+["']server-only["']/.test(text)) return false;
        return LOOKBEHIND.test(text);
      })
      .map((file) => path.relative(ROOT, file).replaceAll("\\", "/"));
    expect(offenders).toEqual([]);
  });
});
