import { linkHref } from "./links";

/**
 * "Te dejo mi contacto" without zod: the limits, the one message the form
 * shares with its validation, and the hrefs for a stored request. The form
 * (a client component) imports this; the schema and the exports are in
 * ./contact, which re-exports everything here.
 * Keep the limits in sync with supabase/migrations/20260929130000_contact_requests.sql.
 */

export const CONTACT_LIMITS = { name: 80, email: 254, phone: 30, company: 80, message: 500 } as const;

/** Shown under the phone and email fields when both are empty. */
export const CONTACT_ONE_OF_ERROR = "Deja tu móvil o tu email: con uno basta.";

/** A stored request as the owner sees it. */
export interface ContactRequest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string;
  message: string;
  source: "direct" | "qr" | "share";
  createdAt: string;
}

export function contactEmailHref(email: string): string {
  return linkHref("email", email);
}

export function contactPhoneHref(phone: string): string {
  return linkHref("phone", phone);
}
