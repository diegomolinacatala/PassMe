"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { DEMO_SLUG } from "@/lib/card/demo";
import { parseContactRequest } from "@/lib/card/contact";
import type { FieldErrors } from "@/lib/card/schema";
import { checkSlug } from "@/lib/card/slug";
import { verifyCaptcha } from "@/lib/captcha";
import { getPublicCard } from "@/lib/data/cards";
import { getOwnerEmail, submitContactRequest } from "@/lib/data/contact-requests";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
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

// Per visitor first; then per card (only for real cards that take requests),
// so blocked or bogus traffic can't use up a card's budget.
const ipLimiter = createSharedRateLimiter({ name: "contact-ip", limit: 5, windowMs: 10 * 60_000 });
const cardLimiter = createSharedRateLimiter({ name: "contact-card", limit: 30, windowMs: 60 * 60_000 });
// Notification emails per owner and day (the rest still land in the editor).
const ownerEmailLimiter = createSharedRateLimiter({ name: "contact-email-owner", limit: 20, windowMs: 24 * 60 * 60_000 });

const GENERIC_ERROR = "No hemos podido enviarlo. Inténtalo de nuevo en un momento.";
const CLOSED = "Esta tarjeta ya no acepta contactos.";

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

/**
 * "You have a new contact" email to the card owner. Deliberately carries none
 * of the visitor's text (a form anyone can fill must not become a way to send
 * arbitrary content from our domain): the details are in the editor.
 */
async function notifyOwner(ownerId: string): Promise<void> {
  if (!isEmailConfigured()) return;
  if (!(await ownerEmailLimiter.check(ownerId)).ok) return;
  const to = await getOwnerEmail(ownerId);
  if (!to) return;
  await sendEmail({
    to,
    subject: "Alguien te ha dejado su contacto en PassMe",
    text: [
      "Una persona que ha visto tu tarjeta te ha dejado sus datos de contacto.",
      "",
      `Los tienes en tu editor: ${getSiteUrl()}/dashboard#contactos`,
      "",
      "Puedes desactivar el formulario cuando quieras en Publicación › «Deja que te dejen su contacto».",
    ].join("\n"),
  });
}

/** "Te dejo mi contacto" on a public card. Bound to the card's slug and visit source. */
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
  if (!(await ipLimiter.check(clientRateKey(requestHeaders))).ok) {
    return fail("Has enviado varios contactos seguidos. Prueba dentro de un rato.");
  }
  if (!(await verifyCaptcha(String(formData.get("captchaToken") ?? ""), getClientIp(requestHeaders)))) {
    return fail("Completa la verificación anti-spam e inténtalo de nuevo.");
  }

  const card = await getPublicCard(cleanSlug);
  if (!card?.acceptsContactRequests) return fail(CLOSED);
  if (!(await cardLimiter.check(cleanSlug)).ok) {
    return fail("Esta tarjeta ha recibido muchos contactos en poco tiempo. Prueba dentro de un rato.");
  }

  const result = await submitContactRequest(cleanSlug, parsed.data, parseVisitSource(source));
  if (!result.ok) return fail(result.reason === "closed" ? CLOSED : GENERIC_ERROR);

  after(() => notifyOwner(result.ownerId));
  return { status: "sent", details };
}
