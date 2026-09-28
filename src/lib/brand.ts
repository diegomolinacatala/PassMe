/**
 * PassMe brand primitives shared by React components and server-side image
 * generation (sharp renders these SVGs into wallet pass PNGs). Paths only — no
 * <text>, because serverless runtimes don't ship fonts for librsvg.
 */

export const BRAND = {
  name: "PassMe",
  ink: "#141414",
  paper: "#F3EFE6",
  signal: "#FF4A1C",
} as const;

/**
 * The mark: a tilted card behind a front card with an avatar cut-out —
 * "a contact card being passed". Drawn on a 64×64 grid.
 */
export function markSvg({
  foreground,
  cutout,
  background,
  size = 64,
  padding = 0,
}: {
  foreground: string;
  /** Color of the avatar hole and name bar (usually the surface behind the mark). */
  cutout: string;
  /** Optional rounded-square plate behind the mark (app icons). */
  background?: string;
  size?: number;
  padding?: number;
}): string {
  const inner = 64 - padding * 2;
  const scale = inner / 64;
  const plate = background ? `<rect width="64" height="64" rx="14" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${plate}<g transform="translate(${padding} ${padding}) scale(${scale})"><rect x="13" y="7" width="34" height="44" rx="8" transform="rotate(-11 30 29)" fill="none" stroke="${foreground}" stroke-width="4" stroke-opacity="0.5"/><rect x="18" y="13" width="34" height="44" rx="8" fill="${foreground}"/><circle cx="35" cy="29" r="7" fill="${cutout}"/><rect x="26" y="42" width="18" height="5" rx="2.5" fill="${cutout}"/></g></svg>`;
}
