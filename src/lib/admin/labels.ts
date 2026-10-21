import { getLinkKind, isLinkKind } from "@/lib/card/links";

/** Spanish words for the CRM's raw values. */

export const PLATFORM_LABELS: Record<string, string> = {
  ios: "iPhone",
  android: "Android",
  other: "Ordenador u otro",
};

export const VIA_LABELS: Record<string, string> = {
  qr: "escaneando el QR",
  share: "con un enlace compartido",
  direct: "abriendo su enlace",
};

export const SOURCE_LABELS: Record<string, string> = {
  qr: "QR",
  share: "Enlace",
  direct: "Directo",
};

export const PROVIDER_LABELS: Record<string, string> = {
  email: "Código por email",
  google: "Google",
  apple: "Apple",
};

export const MEETING_STATUS_LABELS: Record<string, string> = {
  pending: "Pendientes",
  confirmed: "Confirmadas",
  declined: "Rechazadas",
  cancelled: "Canceladas",
};

/** One meeting's state, in a sentence. */
export const MEETING_STATUS_ONE: Record<string, string> = {
  pending: "pendiente",
  confirmed: "confirmada",
  declined: "rechazada",
  cancelled: "cancelada",
};

export const MEETING_FORMAT_LABELS: Record<string, string> = {
  in_person: "En persona",
  video: "Videollamada",
  phone: "Teléfono",
};

let regionNames: Intl.DisplayNames | null = null;

/** "ES" → "España"; the code itself when the runtime doesn't know it. */
export function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["es"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** A card's name as the CRM shows it, or "Sin nombre" when it has none (yet). */
export function cardName(fullName: string | undefined): string {
  return fullName?.trim() || "Sin nombre";
}

/** "1 vez" / "3 veces": Spanish needs the singular. */
export function plural(n: number, one: string, many: string): string {
  return `${new Intl.NumberFormat("es-ES").format(n)} ${n === 1 ? one : many}`;
}

export function providerLabel(provider: string | null): string {
  if (!provider) return "—";
  return PROVIDER_LABELS[provider] ?? provider;
}

export function linkKindLabel(kind: string): string {
  return isLinkKind(kind) ? getLinkKind(kind).label : "Enlace";
}
