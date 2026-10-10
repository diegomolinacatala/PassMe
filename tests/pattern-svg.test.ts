import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PatternSvg } from "@/components/card/pattern-svg";
import { resolveDesign } from "@/lib/card/design";

const design = resolveDesign({ accentColor: "#3E2C23", detailColor: "#F0A574", pattern: "corriente", patternSeed: 4821, typeface: "clasica" });
const box = { width: 375, height: 144 };
const focus = { x: 301, y: 72, r: 38 };

/** The pass images are rendered by Satori on the server: that path must stay plain SVG. */
describe("PatternSvg", () => {
  it("renders plain paths for the server (no drawing attributes without `draw`)", () => {
    const html = renderToStaticMarkup(createElement(PatternSvg, { design, box, focus, width: 375, height: 144 }));
    expect(html).toContain("<path");
    expect(html).not.toContain("pathLength");
    expect(html).not.toContain("animation");
    expect(html).not.toContain("style=");
  });

  it("draws the lines and fades the tints in the browser (`draw`)", () => {
    const html = renderToStaticMarkup(createElement(PatternSvg, { design, box, focus, width: 375, height: 144, draw: true }));
    expect(html).toContain('pathLength="1"');
    expect(html).toContain("motif-draw");
    expect(html).toContain("stroke-dasharray:1");
    // The hidden start state comes from the keyframes, never inline: with animations off, the motif shows finished.
    expect(html).not.toContain("stroke-dashoffset");
  });
});
