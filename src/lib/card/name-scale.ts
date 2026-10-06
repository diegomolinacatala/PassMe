/**
 * How big the name is set on the public card: long names step down so they
 * fit in two or three lines and "Guardar contacto" stays on the first screen.
 */
export type NameScale = "lg" | "md" | "sm";

/** Above these lengths (in characters) the name steps down one size. */
export const NAME_SCALE_LIMITS = { md: 24, sm: 36 } as const;

export function nameScale(name: string): NameScale {
  const length = [...name.trim()].length;
  if (length > NAME_SCALE_LIMITS.sm) return "sm";
  if (length > NAME_SCALE_LIMITS.md) return "md";
  return "lg";
}
