import type { CSSProperties } from "react";
import { sealNumber, type ResolvedDesign } from "@/lib/card/design";
import type { PatternBox, PatternFocus } from "@/lib/card/pattern";
import { DeferredPatternSvg } from "./deferred-pattern-svg";
import { PatternSvg } from "./pattern-svg";

/**
 * The pass artwork: guilloché pattern, avatar seal, name and microtext.
 *
 * Written with inline styles and flexbox only, so the exact same tree renders
 * in the browser (editor preview, landing) and in Satori on the server, which
 * turns it into the Apple Wallet strip and the Google Wallet hero image.
 * Sizes are expressed in wallet points and converted by `unit`.
 */

export type ArtVariant = "strip" | "hero";

/** Apple store-card strip: 375×144 pt. */
export const STRIP_BOX: PatternBox = { width: 375, height: 144 };
/** Google hero image: 1032×336 px → same width in points. */
export const HERO_BOX: PatternBox = { width: 375, height: 122 };

const STRIP_FOCUS: PatternFocus = { x: 301, y: 72, r: 38 };
const HERO_FOCUS: PatternFocus = { x: 187.5, y: 61, r: 21 };

export interface ArtFonts {
  serif: string;
  mono: string;
}

export type Unit = (points: number) => number | string;

/** Browser: points → a share of the nearest `container-type: inline-size` ancestor. */
export const containerUnit: Unit = (points) => `${((points / 375) * 100).toFixed(4)}cqw`;

export const CSS_FONTS: ArtFonts = {
  serif: "var(--font-instrument-serif), Georgia, serif",
  mono: "var(--font-geist-mono), ui-monospace, monospace",
};

interface PassArtProps {
  design: ResolvedDesign;
  variant: ArtVariant;
  name?: string;
  initials?: string;
  avatarSrc?: string | null;
  unit: Unit;
  fonts: ArtFonts;
  /** Satori needs pixel sizes on the root and the SVG; the browser fills its container. */
  pixelSize?: { width: number; height: number };
  /** Browser only: draw the pattern after hydration instead of shipping it in the HTML. */
  deferPattern?: boolean;
}

/** Big names get smaller type; very long ones wrap onto a second line. */
export function nameFontSize(name: string): number {
  const length = name.trim().length;
  if (length <= 10) return 42;
  if (length <= 14) return 37;
  if (length <= 18) return 32;
  if (length <= 24) return 28;
  return 25;
}

export function microtext(name: string): string {
  const chunk = `PASSME · ${name.trim().toUpperCase() || "TARJETA DE CONTACTO"} · `;
  return chunk.repeat(Math.ceil(260 / chunk.length));
}

/** The PassMe mark as a single-color SVG (see lib/brand.ts). */
function MarkSvg({ color, cutout, size }: { color: string; cutout: string; size: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="13" y="7" width="34" height="44" rx="8" transform="rotate(-11 30 29)" fill="none" stroke={color} strokeWidth="4" strokeOpacity="0.55" />
      <rect x="18" y="13" width="34" height="44" rx="8" fill={color} />
      <circle cx="35" cy="29" r="7" fill={cutout} />
      <rect x="26" y="42" width="18" height="5" rx="2.5" fill={cutout} />
    </svg>
  );
}

export function PassArt({ design, variant, name = "", initials = "", avatarSrc, unit: u, fonts, pixelSize, deferPattern }: PassArtProps) {
  const box = variant === "strip" ? STRIP_BOX : HERO_BOX;
  const focus = variant === "strip" ? STRIP_FOCUS : HERO_FOCUS;
  const isSatori = Boolean(pixelSize);
  const length = (points: number) => {
    const value = u(points);
    return typeof value === "number" ? `${value}px` : value;
  };
  const diameter = focus.r * 2;
  const fade = variant === "strip" ? { from: box.width * 0.36, to: box.width * 0.72 } : undefined;
  const Pattern = deferPattern ? DeferredPatternSvg : PatternSvg;

  const root: CSSProperties = {
    position: "relative",
    display: "flex",
    overflow: "hidden",
    backgroundColor: design.background,
    color: design.foreground,
    width: pixelSize ? pixelSize.width : "100%",
    height: pixelSize ? pixelSize.height : u(box.height),
  };

  const seal: CSSProperties = {
    position: "absolute",
    left: u(focus.x - focus.r),
    top: u(focus.y - focus.r),
    width: u(diameter),
    height: u(diameter),
    borderRadius: u(diameter),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };

  return (
    <div style={root}>
      <Pattern
        design={design}
        box={box}
        focus={focus}
        fade={fade}
        width={pixelSize ? pixelSize.width : "100%"}
        height={pixelSize ? pixelSize.height : "100%"}
        style={{ position: "absolute", left: 0, top: 0 }}
      />

      {design.pattern === "liso" || design.pattern === "senal" ? (
        <div
          style={{
            position: "absolute",
            left: u(focus.x - focus.r - 4.5),
            top: u(focus.y - focus.r - 4.5),
            width: u(diameter + 9),
            height: u(diameter + 9),
            borderRadius: u(diameter + 9),
            border: `${length(variant === "strip" ? 1 : 0.8)} solid ${design.detail}`,
            display: "flex",
          }}
        />
      ) : null}

      {variant === "hero" ? (
        <div style={{ ...seal, backgroundColor: design.background }}>
          <MarkSvg color={design.detail} cutout={design.background} size={u(diameter * 0.62)} />
        </div>
      ) : avatarSrc ? (
        <div style={seal}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by Satori too; user photos are tiny */}
          <img src={avatarSrc} alt="" width={diameter} height={diameter} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : (
        <div
          style={{
            ...seal,
            backgroundColor: design.seal,
            fontFamily: fonts.serif,
            fontSize: u(30),
            lineHeight: 1,
            color: design.foreground,
          }}
        >
          {initials || "·"}
        </div>
      )}

      {variant === "strip"
        ? [
          <div
            key="seal-number"
            style={{
              position: "absolute",
              left: u(20),
              top: u(17),
              display: "flex",
              fontFamily: fonts.mono,
              fontSize: u(6.6),
              letterSpacing: u(1.3),
              color: design.label,
              textTransform: "uppercase",
            }}
          >
            {`Sello ${sealNumber(design.seed)}`}
          </div>,
          <div
            key="name"
            style={{
              position: "absolute",
              left: u(19),
              top: u(30),
              bottom: u(24),
              width: u(focus.x - focus.r - 19 - 14),
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontFamily: fonts.serif,
                fontSize: u(nameFontSize(name)),
                lineHeight: 0.98,
                letterSpacing: u(-0.4),
                color: design.foreground,
                overflow: "hidden",
                ...(isSatori
                  ? { display: "block", lineClamp: 2, wordBreak: "break-word" }
                  : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }),
              }}
            >
              {name || "Tu nombre"}
            </div>
          </div>,
          <div
            key="microtext"
            style={{
              position: "absolute",
              left: u(20),
              right: u(20),
              bottom: u(9),
              display: "flex",
              overflow: "hidden",
              whiteSpace: "nowrap",
              fontFamily: fonts.mono,
              fontSize: u(4.4),
              letterSpacing: u(0.9),
              color: design.detail,
              opacity: 0.8,
            }}
          >
            {microtext(name)}
          </div>,
        ]
        : null}
    </div>
  );
}
