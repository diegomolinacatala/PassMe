import "server-only";
import { after } from "next/server";
import type { ValidContactRequest } from "@/lib/card/contact";
import { getPublicCard } from "@/lib/data/cards";
import { getOwnerEmail, submitContactRequest } from "@/lib/data/contact-requests";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getSiteUrl, type VisitSource } from "@/lib/env";

/**
 * Leaving one's details on a card: shared by "Déjale tu contacto" (public
 * form) and "Mandarle mi tarjeta" (the welcome after creating a card), so both
 * spend the same budgets and send the owner the same fixed-text email.
 */

// Per visitor first (checked by each caller); then per card (only for real cards
// that take requests), so blocked or bogus traffic can't use up a card's budget.
export const contactIpLimiter = createSharedRateLimiter({ name: "contact-ip", limit: 5, windowMs: 10 * 60_000 });
const cardLimiter = createSharedRateLimiter({ name: "contact-card", limit: 30, windowMs: 60 * 60_000 });
// Notification emails per owner and day (the rest still land in the editor).
const ownerEmailLimiter = createSharedRateLimiter({ name: "contact-email-owner", limit: 20, windowMs: 24 * 60 * 60_000 });

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
      "Puedes dejar de recibirlos cuando quieras: Publicación › «Recibir contactos».",
    ].join("\n"),
  });
}

export type DeliveryResult = { ok: true } | { ok: false; reason: "closed" | "busy" | "unavailable" };

export const GENERIC_DELIVERY_ERROR = "No hemos podido enviarlo. Inténtalo de nuevo en un momento.";

/** What each failed delivery tells the person who sent it. */
export const DELIVERY_ERRORS: Record<Exclude<DeliveryResult, { ok: true }>["reason"], string> = {
  closed: "Esta tarjeta ya no acepta contactos.",
  busy: "Esta tarjeta ha recibido muchos contactos en poco tiempo. Prueba dentro de un rato.",
  unavailable: GENERIC_DELIVERY_ERROR,
};

/** Stores a validated request on a card that takes them and tells its owner (after the response). */
export async function deliverContactRequest(slug: string, request: ValidContactRequest, source: VisitSource): Promise<DeliveryResult> {
  const card = await getPublicCard(slug);
  if (!card?.acceptsContactRequests) return { ok: false, reason: "closed" };
  if (!(await cardLimiter.check(slug)).ok) return { ok: false, reason: "busy" };

  const result = await submitContactRequest(slug, request, source);
  if (!result.ok) return { ok: false, reason: result.reason === "closed" ? "closed" : "unavailable" };

  after(() => notifyOwner(result.ownerId));
  return { ok: true };
}
