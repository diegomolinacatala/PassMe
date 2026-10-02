"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { DEMO_SLUG } from "@/lib/card/demo";
import type { FieldErrors } from "@/lib/card/schema";
import { checkSlug } from "@/lib/card/slug";
import { verifyCaptcha } from "@/lib/captcha";
import { getPublicCard } from "@/lib/data/cards";
import { submitMeetingRequest } from "@/lib/data/meetings";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { isSupabaseConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { parseMeetingRequest } from "@/lib/meetings/schema";
import { meetingsAvailable, notifyNewProposal } from "@/lib/meetings/service";
import { clientRateKey, getClientIp, parseVisitSource } from "@/lib/request";

export type MeetingRequestState =
  | { status: "idle" }
  | { status: "sent"; demo?: boolean; email: string; details: { name: string; email: string; phone: string; company: string } }
  | { status: "error"; message: string; errors?: FieldErrors };

// Per visitor first; then per card (only for real cards that take proposals).
const ipLimiter = createSharedRateLimiter({ name: "meeting-ip", limit: 5, windowMs: 10 * 60_000 });
const cardLimiter = createSharedRateLimiter({ name: "meeting-card", limit: 20, windowMs: 60 * 60_000 });

const GENERIC_ERROR = "No hemos podido enviarla. Inténtalo de nuevo en un momento.";
const CLOSED = "Esta tarjeta ya no acepta propuestas de reunión.";

function formToInput(formData: FormData) {
  return {
    slots: formData.getAll("slot").map(String).slice(0, 10),
    duration: String(formData.get("duration") ?? ""),
    format: String(formData.get("format") ?? ""),
    location: String(formData.get("location") ?? "").slice(0, 400),
    timeZone: String(formData.get("timeZone") ?? ""),
    name: String(formData.get("name") ?? "").slice(0, 200),
    email: String(formData.get("email") ?? "").slice(0, 300),
    phone: String(formData.get("phone") ?? "").slice(0, 60),
    company: String(formData.get("company") ?? "").slice(0, 200),
    topic: String(formData.get("topic") ?? "").slice(0, 300),
    consent: formData.get("consent") === "on",
  };
}

/** "Agendar reunión" on a public card. Bound to the card's slug and visit source. */
export async function submitMeetingAction(
  slug: string,
  source: string,
  _prev: MeetingRequestState,
  formData: FormData,
): Promise<MeetingRequestState> {
  // Bots fill every field; people never see this one.
  if (String(formData.get("website") ?? "") !== "") return { status: "idle" };

  const parsed = parseMeetingRequest(formToInput(formData));
  if (!parsed.ok) return { status: "error", message: "Revisa los campos marcados.", errors: parsed.errors };
  const { data } = parsed;
  const details = { name: data.name, email: data.email, phone: data.phone ?? "", company: data.company };

  const cleanSlug = String(slug).toLowerCase();
  if (cleanSlug === DEMO_SLUG || !isSupabaseConfigured()) return { status: "sent", demo: true, email: data.email, details };
  if (!checkSlug(cleanSlug).ok || !meetingsAvailable()) return { status: "error", message: GENERIC_ERROR };

  const requestHeaders = await headers();
  if (!(await ipLimiter.check(clientRateKey(requestHeaders))).ok) {
    return { status: "error", message: "Has enviado varias propuestas seguidas. Prueba dentro de un rato." };
  }
  if (!(await verifyCaptcha(String(formData.get("captchaToken") ?? ""), getClientIp(requestHeaders)))) {
    return { status: "error", message: "Completa la verificación anti-spam e inténtalo de nuevo." };
  }

  const card = await getPublicCard(cleanSlug);
  if (!card?.acceptsMeetingRequests) return { status: "error", message: CLOSED };
  if (!(await cardLimiter.check(cleanSlug)).ok) {
    return { status: "error", message: "Esta tarjeta ha recibido muchas propuestas en poco tiempo. Prueba dentro de un rato." };
  }

  const result = await submitMeetingRequest(cleanSlug, data, parseVisitSource(source));
  if (!result.ok) {
    const message =
      result.reason === "closed"
        ? CLOSED
        : result.reason === "full"
          ? `${card.fullName.split(/\s+/)[0]} tiene muchas propuestas pendientes. Prueba a dejarle tu contacto.`
          : GENERIC_ERROR;
    return { status: "error", message };
  }

  after(() => notifyNewProposal(result.id).catch((error: unknown) => log.error("meeting proposal email failed", {}, error)));
  return { status: "sent", email: data.email, details };
}
