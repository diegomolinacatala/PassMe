import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, mix, parseHex, type Rgb } from "@/lib/card/colors";

/**
 * Contrast of the UI states (UX audit P3.3, WCAG 1.4.3 and 1.4.11), measured
 * on the real tokens of src/app/globals.css: change a color there and this
 * tells you which state stopped being visible.
 */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function token(name: string): Rgb {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  const rgb = match ? parseHex(match[1]!.toLowerCase()) : null;
  if (!rgb) throw new Error(`Missing color token --color-${name}`);
  return rgb;
}

/** A translucent color (`bg-ok/10`) laid over a surface. */
const over = (surface: Rgb, color: Rgb, alpha: number): Rgb => mix(surface, color, alpha);
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

const UI = 3; // borders, focus outlines, selected states
const TEXT = 4.5; // small text

describe("design tokens: contrast of the UI states", () => {
  const paper = token("paper");
  const card = token("card");
  const paperDeep = token("paper-deep");

  it.each([
    ["field border on card", token("field-border"), card, UI],
    ["field border on paper", token("field-border"), paper, UI],
    ["field border on paper-deep", token("field-border"), paperDeep, UI],
    ["switch off (muted outline) on card", token("muted"), card, UI],
    ["switch off (muted outline) on paper", token("muted"), paper, UI],
    ["selected segment / tab (ink) on paper-deep", token("ink"), paperDeep, UI],
    ["selected segment / tab text (paper on ink)", paper, token("ink"), TEXT],
    ["danger button border on paper", token("danger"), paper, UI],
    ["danger button border on card", token("danger"), card, UI],
    ["focus outline (signal) on paper", token("signal"), paper, UI],
    ["focus outline (signal) on card", token("signal"), card, UI],
    ["signal button text (white on signal-strong)", WHITE, token("signal-strong"), TEXT],
    ["muted text on paper-deep", token("muted"), paperDeep, TEXT],
    // The ok notice says it with its icon; its title is ink (ok text on the tint is only ~4:1).
    ["ok notice icon on its tint", token("ok"), over(paper, token("ok"), 0.1), UI],
  ] as const)("%s ≥ %s:1", (_name, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it.each([
    ["ok notice text (ink-soft on its tint)", token("ink-soft"), over(paper, token("ok"), 0.1)],
    ["error notice text", token("danger"), token("danger-wash")],
    ["info notice text", token("signal-deep"), token("signal-wash")],
    ["undo notice action (glow on ink)", token("glow"), token("ink")],
  ] as const)("%s is readable as small text", (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(TEXT);
  });
});
