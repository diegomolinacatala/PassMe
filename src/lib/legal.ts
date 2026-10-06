/**
 * Who runs PassMe, for the legal pages (LSSI-CE art. 10 and GDPR art. 13).
 * Set the NEXT_PUBLIC_LEGAL_* variables before launch; until then the pages
 * show bracketed placeholders so the gap is obvious.
 */

export interface LegalIdentity {
  name: string;
  taxId: string;
  address: string;
  email: string;
  /** False while any of the values above is still a placeholder. */
  complete: boolean;
}

export function getLegalIdentity(): LegalIdentity {
  const name = process.env.NEXT_PUBLIC_LEGAL_NAME?.trim();
  const taxId = process.env.NEXT_PUBLIC_LEGAL_TAX_ID?.trim();
  const address = process.env.NEXT_PUBLIC_LEGAL_ADDRESS?.trim();
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return {
    name: name || "[Nombre y apellidos o razón social]",
    taxId: taxId || "[NIF]",
    address: address || "[Dirección postal]",
    email: email || "[email de contacto]",
    complete: Boolean(name && taxId && address && email),
  };
}

/** Bump it in every change to /privacidad, /terminos or /aviso-legal. */
export const LEGAL_UPDATED = "octubre de 2026";

/** «En 30 segundos» on /privacidad. Keep it true to the full policy below it. */
export const PRIVACY_SUMMARY = [
  "Para tener tu tarjeta solo te pedimos un email; lo demás lo decides tú.",
  "Lo que ocultas no sale de nuestro servidor: quien escanea tu QR solo ve lo que marcas como visible.",
  "Sin cookies de seguimiento ni direcciones IP en las estadísticas.",
  "Lo borras todo con un botón: tu tarjeta, tu foto, tus estadísticas y lo que te han dejado.",
];

/** Anchor for a legal section without an explicit id: "Qué datos guardamos" → "que-datos-guardamos". */
export function legalSectionId(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
