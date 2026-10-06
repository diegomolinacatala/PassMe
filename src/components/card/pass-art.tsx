import type { CSSProperties } from "react";
import type { ResolvedDesign, Typeface } from "@/lib/card/design";
import { nameFontSize } from "@/lib/card/name";
import { fadesUnderText, type PatternBox, type PatternFocus } from "@/lib/card/pattern";
import { DeferredPatternSvg } from "./deferred-pattern-svg";
import { PatternSvg } from "./pattern-svg";

/**
 * The pass artwork: generative motif, avatar and name.
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

/** Gap between the avatar and its hairline frame. */
const FRAME_GAP = 4.5;
/** Monogram font size, as a share of the strip height (the letter bleeds off both edges). */
const MONOGRAM_SIZE = 1.75;
export const MONOGRAM_OPACITY = 0.36;
const NAME_LEFT = 20;

export interface ArtFonts {
  serif: string;
  sans: string;
}

export type Unit = (points: number) => number | string;

/** Browser: points → a share of the nearest `container-type: inline-size` ancestor. */
export const containerUnit: Unit = (points) => `${((points / 375) * 100).toFixed(4)}cqw`;

export const CSS_FONTS: ArtFonts = {
  serif: "var(--font-instrument-serif), Georgia, serif",
  sans: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
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

/**
 * The monogram's letter and its box for an avatar of radius `r`, in the
 * strip's proportions: a letter this big bleeds off both edges on purpose.
 */
export function monogram(name: string, r: number): { letter: string; size: number; shiftX: number } {
  return {
    letter: name.trim().charAt(0).toUpperCase(),
    size: (MONOGRAM_SIZE * STRIP_BOX.height * r) / STRIP_FOCUS.r,
    shiftX: -0.25 * r,
  };
}

/** "Editorial" sets the first name upright and the rest, in italics, on a second line. */
export function editorialLines(name: string): [string, string] {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return [first, rest.join(" ")];
}

/** Letterforms of each typeface. Geist runs wider than Instrument Serif, hence the smaller size. */
function typeStyle(typeface: Typeface, fonts: ArtFonts): { style: CSSProperties; scale: number; tracking: number } {
  switch (typeface) {
    case "moderna":
      return { style: { fontFamily: fonts.sans, fontWeight: 500 }, scale: 0.82, tracking: -0.6 };
    case "cursiva":
      return { style: { fontFamily: fonts.serif, fontStyle: "italic" }, scale: 1, tracking: -0.3 };
    case "clasica":
    case "editorial":
      return { style: { fontFamily: fonts.serif }, scale: 1, tracking: -0.4 };
  }
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

/** Truncates to `lines` lines in both renderers (they spell line clamping differently). */
function clamp(lines: number, isSatori: boolean): CSSProperties {
  return isSatori
    ? { display: "block", lineClamp: lines, wordBreak: "break-word", overflow: "hidden" }
    : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflowWrap: "anywhere", overflow: "hidden" };
}

interface NameProps {
  name: string;
  design: ResolvedDesign;
  fonts: ArtFonts;
  unit: Unit;
  isSatori: boolean;
}

/** The name, set in the owner's typeface. */
function Name({ name, design, fonts, unit: u, isSatori }: NameProps) {
  const type = typeStyle(design.typeface, fonts);
  const [first, rest] = editorialLines(name);
  const line = (text: string, size: number, lines: number, extra?: CSSProperties) => (
    <div
      style={{
        ...type.style,
        ...extra,
        fontSize: u(size * type.scale),
        lineHeight: 0.98,
        letterSpacing: u(type.tracking),
        color: design.foreground,
        ...clamp(lines, isSatori),
      }}
    >
      {text}
    </div>
  );

  if (design.typeface === "editorial" && rest) {
    const size = nameFontSize(first.length > rest.length ? first : rest);
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {line(first, size, 1)}
        {line(rest, size, 2, { fontStyle: "italic", letterSpacing: u(-0.3) })}
      </div>
    );
  }
  return line(name, nameFontSize(name), 2);
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
  const frame = diameter + FRAME_GAP * 2;
  const fade = variant === "strip" && fadesUnderText(design.pattern) ? { from: box.width * 0.36, to: box.width * 0.72 } : undefined;
  const Pattern = deferPattern ? DeferredPatternSvg : PatternSvg;
  const type = typeStyle(design.typeface, fonts);
  const letter = design.pattern === "monograma" ? monogram(name, focus.r) : null;

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
      {letter?.letter ? (
        <div
          style={{
            position: "absolute",
            left: u(focus.x + letter.shiftX - letter.size),
            top: u(focus.y - letter.size),
            width: u(letter.size * 2),
            height: u(letter.size * 2),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...type.style,
            // Serif monograms are always italic: an upright capital reads as plain text.
            ...(design.typeface === "moderna" ? {} : { fontStyle: "italic" }),
            fontSize: u(letter.size * (design.typeface === "moderna" ? 0.8 : 1)),
            lineHeight: 1,
            color: design.detail,
            opacity: MONOGRAM_OPACITY,
          }}
        >
          {letter.letter}
        </div>
      ) : null}

      <Pattern
        design={design}
        box={box}
        focus={focus}
        fade={fade}
        width={pixelSize ? pixelSize.width : "100%"}
        height={pixelSize ? pixelSize.height : "100%"}
        style={{ position: "absolute", left: 0, top: 0 }}
      />

      {/* Hairline frame around the avatar. */}
      <div
        style={{
          position: "absolute",
          left: u(focus.x - frame / 2),
          top: u(focus.y - frame / 2),
          width: u(frame),
          height: u(frame),
          borderRadius: u(frame),
          border: `${length(variant === "strip" ? 0.9 : 0.8)} solid ${design.detail}`,
          display: "flex",
        }}
      />

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
            ...type.style,
            fontStyle: "normal",
            backgroundColor: design.seal,
            fontSize: u(30 * type.scale),
            lineHeight: 1,
            color: design.foreground,
          }}
        >
          {initials || "·"}
        </div>
      )}

      {variant === "strip" ? (
        <div
          style={{
            position: "absolute",
            left: u(NAME_LEFT),
            top: u(14),
            bottom: u(14),
            width: u(focus.x - frame / 2 - NAME_LEFT - 14),
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <Name name={name || "Tu nombre"} design={design} fonts={fonts} unit={u} isSatori={isSatori} />
        </div>
      ) : null}
    </div>
  );
}
