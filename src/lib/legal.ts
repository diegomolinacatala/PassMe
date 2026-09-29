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

export const LEGAL_UPDATED = "septiembre de 2026";
