"use server";

import { headers } from "next/headers";
import { DEMO_SLUG } from "@/lib/card/demo";
import { parseContactRequest } from "@/lib/card/contact";
import type { FieldErrors } from "@/lib/card/schema";
import { checkSlug } from "@/lib/card/slug";
import { verifyCaptcha } from "@/lib/captcha";
import { contactIpLimiter, deliverContactRequest, DELIVERY_ERRORS, GENERIC_DELIVERY_ERROR as GENERIC_ERROR } from "@/lib/contact-delivery";
import { isSupabaseConfigured } from "@/lib/env";
import { clientRateKey, getClientIp, parseVisitSource } from "@/lib/request";

export type ContactFormState =
  | { status: "idle" }
  // `details` echoes what the visitor sent, so "Crea la tuya" can start from it.
  | { status: "sent"; demo?: boolean; details?: SentDetails }
  // `values` refills the form: React resets uncontrolled fields after every submission.
  | { status: "error"; message: string; errors?: FieldErrors; values?: ContactFormValues };

export interface SentDetails {
  name: string;
  email: string;
  phone: string;
  company: string;
}

export interface ContactFormValues {
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
  consent: boolean;
}


function formToInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    company: String(formData.get("company") ?? ""),
    message: String(formData.get("message") ?? ""),
    consent: formData.get("consent") === "on",
  };
}

/** "Déjale tu contacto" on a public card. Bound to the card's slug and visit source. */
export async function submitContactAction(
  slug: string,
  source: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  // Bots fill every field; people never see this one.
  if (String(formData.get("website") ?? "") !== "") return { status: "sent" };

  const input = formToInput(formData);
  const values: ContactFormValues = {
    name: input.name.slice(0, 200),
    email: input.email.slice(0, 300),
    phone: input.phone.slice(0, 60),
    company: input.company.slice(0, 200),
    message: input.message.slice(0, 1000),
    consent: input.consent,
  };
  const fail = (message: string, errors?: FieldErrors): ContactFormState => ({ status: "error", message, errors, values });

  const parsed = parseContactRequest(input);
  if (!parsed.ok) return fail("Revisa los campos marcados.", parsed.errors);

  const details: SentDetails = {
    name: parsed.data.name,
    email: parsed.data.email ?? "",
    phone: parsed.data.phone ?? "",
    company: parsed.data.company,
  };
  const cleanSlug = String(slug).toLowerCase();
  if (cleanSlug === DEMO_SLUG || !isSupabaseConfigured()) return { status: "sent", demo: true, details };
  if (!checkSlug(cleanSlug).ok) return fail(GENERIC_ERROR);

  const requestHeaders = await headers();
  if (!(await contactIpLimiter.check(clientRateKey(requestHeaders))).ok) {
    return fail("Has enviado varios contactos seguidos. Prueba dentro de un rato.");
  }
  if (!(await verifyCaptcha(String(formData.get("captchaToken") ?? ""), getClientIp(requestHeaders)))) {
    return fail("Completa la verificación anti-spam e inténtalo de nuevo.");
  }

  const delivery = await deliverContactRequest(cleanSlug, parsed.data, parseVisitSource(source));
  if (!delivery.ok) return fail(DELIVERY_ERRORS[delivery.reason]);
  return { status: "sent", details };
}
