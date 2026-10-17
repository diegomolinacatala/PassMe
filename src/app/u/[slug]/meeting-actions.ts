"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { DEMO_SLUG } from "@/lib/card/demo";
import type { FieldErrors } from "@/lib/card/schema";
import { checkSlug } from "@/lib/card/slug";
import { verifyCaptcha } from "@/lib/captcha";
import { lookupPublicCard } from "@/lib/data/cards";
import { proposalOutsideRules } from "@/lib/meetings/settings";
import { submitMeetingRequest } from "@/lib/data/meetings";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { isSupabaseConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { parseMeetingRequest } from "@/lib/meetings/schema";
import { meetingPath } from "@/lib/meetings/links";
import { admitNewProposal, meetingsAvailable, sendNewProposal } from "@/lib/meetings/service";
import { DEMO_MEETING_ID } from "@/lib/meetings/view";
import { clientRateKey, getClientIp, parseVisitSource } from "@/lib/request";

export type MeetingRequestState =
  | { status: "idle" }
  | {
      status: "sent";
      demo?: boolean;
      email: string;
      details: { name: string; email: string; phone: string; company: string };
      /** The visitor's own signed page, to check or cancel what they sent. */
      guestPath: string | null;
      /** Saved, but the owner's email couldn't be sent (an allowance, or setup): say so rather than "ya la tiene". */
      emailSkipped?: true;
    }
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
  if (cleanSlug === DEMO_SLUG || !isSupabaseConfigured()) return { status: "sent", demo: true, email: data.email, details, guestPath: `/reunion/${DEMO_MEETING_ID}/invitado` };
  if (!checkSlug(cleanSlug).ok || !meetingsAvailable()) return { status: "error", message: GENERIC_ERROR };

  const requestHeaders = await headers();
  if (!(await ipLimiter.check(clientRateKey(requestHeaders))).ok) {
    return { status: "error", message: "Has enviado varias propuestas seguidas. Prueba dentro de un rato." };
  }
  if (!(await verifyCaptcha(String(formData.get("captchaToken") ?? ""), getClientIp(requestHeaders)))) {
    return { status: "error", message: "Completa la verificación anti-spam e inténtalo de nuevo." };
  }

  const lookup = await lookupPublicCard(cleanSlug);
  // A database hiccup is not "this card stopped taking proposals".
  if (lookup.status === "error") return { status: "error", message: GENERIC_ERROR };
  const card = lookup.status === "found" ? lookup.card : null;
  if (!card?.acceptsMeetingRequests) return { status: "error", message: CLOSED };
  // The owner's settings (P8.4), checked here whatever the browser sent.
  const outside = proposalOutsideRules(card, data);
  if (outside) return { status: "error", message: "Revisa los campos marcados.", errors: outside };
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
          : result.reason === "guest_full"
            ? `Ya tienes dos propuestas pendientes con ${card.fullName.split(/\s+/)[0]}. Espera a que responda o cancela una desde tu email.`
            : GENERIC_ERROR;
    return { status: "error", message };
  }

  // The proposal is saved either way. Whether the owner's email may go is decided now, so the visitor isn't told "sent" when it won't be.
  const emailAdmitted = await admitNewProposal(result.id, result.ownerId);
  if (emailAdmitted) {
    after(() =>
      sendNewProposal(result.id).catch((error: unknown) => log.error("meeting proposal email failed", { kind: "proposal", meetingId: result.id, party: "owner" }, error)),
    );
  }
  return {
    status: "sent",
    email: data.email,
    details,
    guestPath: meetingPath(result.id, "guest"),
    ...(emailAdmitted ? {} : { emailSkipped: true as const }),
  };
}
