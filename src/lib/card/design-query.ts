import { CARD_THEMES, DEFAULT_THEME, DEFAULT_TYPEFACE, isPatternSeed, isTypeface, type Typeface } from "./design";
import { DEFAULT_PATTERN, isPatternKind, type PatternKind } from "./pattern";

/**
 * A design picked before the card exists (the landing's "Hazla tuya"), carried
 * to /crear in the query string: ?tema=cafe&motivo=corriente&letra=cursiva&variacion=4821.
 * Nothing personal travels here, only choices from fixed lists.
 */

export interface ChosenDesign {
  theme: string;
  pattern: PatternKind;
  typeface: Typeface;
  patternSeed: number;
}

export const DESIGN_PARAMS = { theme: "tema", pattern: "motivo", typeface: "letra", seed: "variacion" } as const;

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

/**
 * The design in a /crear query, or null when it carries none. Unknown values
 * fall back to the defaults, so a tampered link still makes a sensible card.
 */
export function parseDesignQuery(query: Query): ChosenDesign | null {
  const theme = first(query[DESIGN_PARAMS.theme]);
  const pattern = first(query[DESIGN_PARAMS.pattern]);
  const typeface = first(query[DESIGN_PARAMS.typeface]);
  const seed = first(query[DESIGN_PARAMS.seed]);
  if (theme === null && pattern === null && typeface === null && seed === null) return null;
  const seedNumber = seed === null ? Number.NaN : Number(seed);
  return {
    theme: CARD_THEMES.some((t) => t.id === theme) ? (theme as string) : DEFAULT_THEME.id,
    pattern: isPatternKind(pattern) ? pattern : DEFAULT_PATTERN,
    typeface: isTypeface(typeface) ? typeface : DEFAULT_TYPEFACE,
    patternSeed: isPatternSeed(seedNumber) ? seedNumber : 0,
  };
}

/** "/crear?tema=…": the link that creates a card with this design. */
export function createWithDesignPath(design: ChosenDesign): string {
  const params = new URLSearchParams({
    [DESIGN_PARAMS.theme]: design.theme,
    [DESIGN_PARAMS.pattern]: design.pattern,
    [DESIGN_PARAMS.typeface]: design.typeface,
    [DESIGN_PARAMS.seed]: String(design.patternSeed),
  });
  return `/crear?${params.toString()}`;
}
