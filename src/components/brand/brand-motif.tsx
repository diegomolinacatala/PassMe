import type { CSSProperties } from "react";
import { DeferredPatternSvg } from "@/components/card/deferred-pattern-svg";
import { BRAND } from "@/lib/brand";
import { DEFAULT_TYPEFACE, resolveDesign } from "@/lib/card/design";
import type { PatternKind } from "@/lib/card/pattern";

interface BrandMotifProps {
  /** Ink of the lines; defaults to Naranja. */
  color?: string;
  pattern?: PatternKind;
  seed?: number;
  /** Rendered size in px (square unless height is given). */
  size: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Decorative brand motif — the same generator as the passes, used as texture
 * behind hero objects and CTAs. Purely presentational.
 */
export function BrandMotif({ color = BRAND.signal, pattern = "corriente", seed = 7, size, height = size, className, style }: BrandMotifProps) {
  const design = resolveDesign({ accentColor: BRAND.paper, detailColor: color, pattern, patternSeed: seed, typeface: DEFAULT_TYPEFACE });
  // Force the chosen ink even when it's close to paper (e.g. on dark sections).
  const ink = { ...design, detail: color };
  const box = { width: size, height };
  // Soft vignette so the texture never shows the edges of its box.
  const vignette = "radial-gradient(closest-side, #000 45%, transparent 100%)";
  return (
    <div className={className} style={{ maskImage: vignette, WebkitMaskImage: vignette, ...style }} aria-hidden="true">
      <DeferredPatternSvg
        design={ink}
        box={box}
        focus={{ x: size / 2, y: height / 2, r: Math.min(size, height) * 0.14 }}
        width={size}
        height={height}
        style={{ display: "block", maxWidth: "none" }}
      />
    </div>
  );
}
