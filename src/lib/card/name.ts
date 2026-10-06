/**
 * Pure helpers about the owner's name, shared by the browser and the pass
 * renderer (Satori): no React, no DOM.
 */

/** Words skipped when picking the second initial ("Pablo de la Fuente" → "PF"). */
const NAME_PARTICLES: ReadonlySet<string> = new Set(["de", "del", "la", "las", "los", "y"]);

function firstLetter(word: string): string {
  return Array.from(word)[0] ?? "";
}

/**
 * Two initials for the avatar: first name + surname. With three words or more,
 * the surname is the first word after the name that isn't a particle
 * ("Pablo Serrano Iglesias de la Fuente" → "PS"), not the last one.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return firstLetter(parts[0]!).toUpperCase();
  const surname = parts.length >= 3 ? (parts.slice(1).find((word) => !NAME_PARTICLES.has(word.toLowerCase())) ?? parts.at(-1)!) : parts[1]!;
  return `${firstLetter(parts[0]!)}${firstLetter(surname)}`.toUpperCase();
}

/** Big names get smaller type on the pass; very long ones wrap onto a second line. */
export function nameFontSize(name: string): number {
  const length = name.trim().length;
  if (length <= 10) return 42;
  if (length <= 14) return 37;
  if (length <= 18) return 32;
  if (length <= 24) return 28;
  return 25;
}

/** Room for the name on the pass strip, in pass points, and the serif's average glyph width (em). */
const PASS_NAME_WIDTH = 230;
const AVERAGE_GLYPH_EM = 0.45;
const PASS_NAME_LINES = 2;

/**
 * True when the name won't fit in the pass's two lines and gets cut. An
 * estimate (greedy word wrap at the name's type size), good enough for a hint.
 */
export function passNameOverflows(name: string): boolean {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const perLine = Math.floor(PASS_NAME_WIDTH / (nameFontSize(name) * AVERAGE_GLYPH_EM));
  let lines = 0;
  let current = 0;
  for (const word of words) {
    const length = Array.from(word).length;
    if (current > 0 && current + 1 + length <= perLine) {
      current += 1 + length;
      continue;
    }
    lines += Math.max(1, Math.ceil(length / perLine));
    current = length > perLine ? length % perLine || perLine : length;
  }
  return lines > PASS_NAME_LINES;
}
