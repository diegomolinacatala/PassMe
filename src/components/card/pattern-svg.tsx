import type { CSSProperties, ReactElement, Ref } from "react";
import type { ResolvedDesign } from "@/lib/card/design";
import { patternLayers, type PatternBox, type PatternFocus, type PatternLayer } from "@/lib/card/pattern";

/**
 * The generative motif as an SVG, in the card's detail color. Pure (no
 * hooks, no element ids) so Satori can render it on the server; browsers use
 * <DeferredPatternSvg> to keep the path data out of the HTML.
 */

export interface PatternSvgProps {
  design: ResolvedDesign;
  box: PatternBox;
  focus: PatternFocus;
  /** Fade the pattern towards the left edge (where the name sits), in box units. */
  fade?: { from: number; to: number };
  width: number | string;
  height: number | string;
  style?: CSSProperties;
  /** Precomputed layers (the browser memoizes them); drawn from the design when omitted. */
  layers?: ReadonlyArray<PatternLayer>;
  /**
   * Browser only: the lines draw themselves and the tints fade in when the
   * motif appears (`pathLength` + the motif-draw keyframes). Never for Satori.
   */
  draw?: boolean;
  /** Browser only: the <svg> element (to watch it scroll into view). */
  ref?: Ref<SVGSVGElement>;
}

/** How long the lines take to draw, and the stagger between layers. */
const DRAW_MS = 1500;
const DRAW_STAGGER_MS = 90;

/**
 * The hidden start lives in the keyframes (fill-mode `both`), never inline:
 * with animations switched off, the motif simply shows finished.
 */
function drawStyle(layer: PatternLayer, index: number): CSSProperties {
  const delay = `${index * DRAW_STAGGER_MS}ms`;
  return layer.mode === "stroke"
    ? { strokeDasharray: 1, animation: `motif-draw ${DRAW_MS}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay} both` }
    : { animation: `pattern-in 900ms cubic-bezier(0.16, 1, 0.3, 1) ${delay} both` };
}

/** The generative pattern alone, in the card's detail color. */
export function PatternSvg({ design, box, focus, fade, width, height, style, layers: given, draw, ref }: PatternSvgProps): ReactElement | null {
  const layers = given ?? patternLayers(design.pattern, design.seed, box, focus);
  if (layers.length === 0) return null;

  // A CSS mask instead of an SVG gradient: no element ids, so any number of
  // artworks can share a page (and Satori supports it too).
  const mask = fade
    ? `linear-gradient(to right, rgba(0,0,0,0.22) ${pct(fade.from / box.width)}, rgba(0,0,0,1) ${pct(fade.to / box.width)})`
    : undefined;

  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      viewBox={`0 0 ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={mask ? { ...style, maskImage: mask, WebkitMaskImage: mask } : style}
    >
      {layers.map((layer, index) => (
        <path
          key={index}
          d={layer.d}
          fill={layer.mode === "fill" ? design.detail : "none"}
          stroke={layer.mode === "stroke" ? design.detail : "none"}
          strokeWidth={layer.width}
          strokeLinejoin="round"
          opacity={layer.opacity}
          pathLength={draw && layer.mode === "stroke" ? 1 : undefined}
          style={draw ? drawStyle(layer, index) : undefined}
        />
      ))}
    </svg>
  );
}

const pct = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;
