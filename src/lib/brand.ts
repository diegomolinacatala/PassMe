/**
 * PassMe brand primitives shared by React components and server-side image
 * generation (sharp renders these SVGs into wallet pass PNGs). Paths only — no
 * <text>, because serverless runtimes don't ship fonts for librsvg.
 */

/**
 * Brand inks (see docs/BRAND.md):
 *   Papel — the beige paper · Café — text and dark surfaces · Naranja — the one
 *   accent and every action · Melocotón — pastel highlight on Café surfaces.
 */
export const BRAND = {
  name: "PassMe",
  ink: "#221B17",
  paper: "#F3EFE6",
  signal: "#E4572A",
  glow: "#F6C6A6",
} as const;

/**
 * The mark: a tilted card behind a front card with an avatar cut-out —
 * "a contact card being passed". Drawn on a 64×64 grid.
 */
export function markSvg({
  foreground,
  cutout,
  background,
  echo,
  size = 64,
  padding = 0,
}: {
  foreground: string;
  /** Color of the avatar hole and name bar (usually the surface behind the mark). */
  cutout: string;
  /** Optional rounded-square plate behind the mark (app icons). */
  background?: string;
  /** Color of the card being passed behind; defaults to a faded foreground. */
  echo?: string;
  size?: number;
  padding?: number;
}): string {
  const inner = 64 - padding * 2;
  const scale = inner / 64;
  const plate = background ? `<rect width="64" height="64" rx="14" fill="${background}"/>` : "";
  const echoPaint = echo ? `stroke="${echo}"` : `stroke="${foreground}" stroke-opacity="0.5"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${plate}<g transform="translate(${padding} ${padding}) scale(${scale})"><rect x="13" y="7" width="34" height="44" rx="8" transform="rotate(-11 30 29)" fill="none" ${echoPaint} stroke-width="4"/><rect x="18" y="13" width="34" height="44" rx="8" fill="${foreground}"/><circle cx="35" cy="29" r="7" fill="${cutout}"/><rect x="26" y="42" width="18" height="5" rx="2.5" fill="${cutout}"/></g></svg>`;
}

/** App/notification icon: a Papel card on a Café plate, Naranja cut-outs and echo. */
export function appIconSvg(padding = 6): string {
  return markSvg({ foreground: BRAND.paper, cutout: BRAND.signal, background: BRAND.ink, echo: BRAND.signal, padding });
}
