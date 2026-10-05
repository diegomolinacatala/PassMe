import type { FieldErrors } from "./schema";

const FIELD_NAMES: Record<string, string> = {
  fullName: "tu nombre",
  headline: "el cargo",
  company: "la empresa",
  location: "la ubicación",
  pronouns: "los pronombres",
  bio: "«Sobre ti»",
  slug: "el enlace de tu tarjeta",
  avatarPath: "la foto",
};

/** "Falta tu nombre." / "Revisa el cargo." / "Hay 3 campos por revisar.": never only a red border. */
export function describeErrors(errors: FieldErrors, draft: { fullName: string }): string {
  const keys = Object.keys(errors).filter((key) => key !== "_form");
  if (keys.length === 0) return errors._form ?? "Revisa los campos marcados.";
  if (keys.length > 1) return `Hay ${keys.length} campos por revisar.`;
  const key = keys[0]!;
  if (key === "fullName" && !draft.fullName.trim()) return "Falta tu nombre.";
  if (key.startsWith("links.")) return key.endsWith(".label") ? "Revisa el título de una web." : "Revisa uno de tus datos de contacto.";
  return `Revisa ${FIELD_NAMES[key] ?? "el campo marcado"}.`;
}
