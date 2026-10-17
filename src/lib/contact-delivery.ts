import "server-only";
import { after } from "next/server";
import type { ValidContactRequest } from "@/lib/card/contact";
import { lookupPublicCard } from "@/lib/data/cards";
import { getOwnerEmail, submitContactRequest } from "@/lib/data/contact-requests";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getSiteUrl, type VisitSource } from "@/lib/env";
import { log } from "@/lib/log";

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
const ownerEmailLimiter = createSharedRateLimiter({ name: "contact-email-owner", limit: 10, windowMs: 24 * 60 * 60_000 });
// ...and for the whole service: anyone can open cards and fill their form, so the total these
// emails can cost (Resend's daily plan is shared with login codes and meetings) must have a ceiling.
// CONTACT_EMAIL_DAILY_BUDGET raises it once the plan allows (like MEETING_EMAIL_DAILY_BUDGET).
const DEFAULT_CONTACT_EMAIL_DAILY_BUDGET = 20;
let allEmailLimiter: { limit: number; limiter: ReturnType<typeof createSharedRateLimiter> } | null = null;
function contactEmailBudget() {
  const configured = Number(process.env.CONTACT_EMAIL_DAILY_BUDGET);
  const limit = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_CONTACT_EMAIL_DAILY_BUDGET;
  if (allEmailLimiter?.limit !== limit) {
    allEmailLimiter = { limit, limiter: createSharedRateLimiter({ name: "contact-email-all", limit, windowMs: 24 * 60 * 60_000 }) };
  }
  return allEmailLimiter.limiter;
}

/**
 * "You have a new contact" email to the card owner. Deliberately carries none
 * of the visitor's text (a form anyone can fill must not become a way to send
 * arbitrary content from our domain): the details are in the editor.
 */
async function notifyOwner(ownerId: string): Promise<void> {
  if (!isEmailConfigured()) return;
  // The owner's own limit first, so one chatty card can't spend the whole service's budget.
  if (!(await ownerEmailLimiter.check(ownerId)).ok) return;
  const budget = contactEmailBudget();
  if (!(await budget.check("all")).ok) {
    log.warn("contact notification emails: daily budget spent", { budget: allEmailLimiter?.limit });
    return;
  }
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
  const lookup = await lookupPublicCard(slug);
  // A database hiccup is not "this card stopped taking contacts".
  if (lookup.status === "error") return { ok: false, reason: "unavailable" };
  const card = lookup.status === "found" ? lookup.card : null;
  if (!card?.acceptsContactRequests) return { ok: false, reason: "closed" };
  if (!(await cardLimiter.check(slug)).ok) return { ok: false, reason: "busy" };

  const result = await submitContactRequest(slug, request, source);
  if (!result.ok) return { ok: false, reason: result.reason === "closed" ? "closed" : "unavailable" };

  after(() => notifyOwner(result.ownerId));
  return { ok: true };
}
