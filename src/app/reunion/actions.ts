"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import type { FieldErrors } from "@/lib/card/schema";
import { getMeetingRecord, withOwnerEmail } from "@/lib/data/meetings";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { DEMO_CARD } from "@/lib/card/demo";
import { isSupabaseConfigured } from "@/lib/env";
import { verifyMeetingSignature } from "@/lib/meetings/links";
import { parseClose, parseConfirm, parseCounter } from "@/lib/meetings/schema";
import { changeMeeting } from "@/lib/meetings/service";
import { applyChange, type MeetingChange, type MeetingParty } from "@/lib/meetings/state";
import { DEMO_MEETING_ID, demoMeeting, toMeetingView, type MeetingView } from "@/lib/meetings/view";
import { clientRateKey } from "@/lib/request";

export type MeetingResponseState =
  | { status: "idle" }
  | { status: "done"; action: MeetingChange["action"]; view: MeetingView; demo?: boolean }
  | { status: "error"; message: string; errors?: FieldErrors };

// Each answer can send emails: keep it human-paced, per meeting and per connection.
const meetingLimiter = createSharedRateLimiter({ name: "meeting-answer", limit: 8, windowMs: 10 * 60_000 });
const ipLimiter = createSharedRateLimiter({ name: "meeting-answer-ip", limit: 30, windowMs: 10 * 60_000 });

const INVALID_LINK = "Este enlace no es válido. Ábrelo de nuevo desde el último email.";

function changeFromForm(formData: FormData, format: Parameters<typeof parseConfirm>[1]):
  | { ok: true; change: MeetingChange }
  | { ok: false; errors: FieldErrors } {
  const intent = String(formData.get("intent") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 1000);
  switch (intent) {
    case "confirm": {
      const parsed = parseConfirm(
        { slot: String(formData.get("slot") ?? ""), location: String(formData.get("location") ?? "").slice(0, 700) },
        format,
      );
      if (!parsed.ok) return parsed;
      // Untouched place field: keep the one already proposed.
      const location = formData.has("location") ? parsed.data.location : undefined;
      return { ok: true, change: { action: "confirm", slot: parsed.data.slot, location } };
    }
    case "counter": {
      const parsed = parseCounter({ slots: formData.getAll("slot").map(String).slice(0, 10), note });
      return parsed.ok ? { ok: true, change: { action: "counter", slots: parsed.data.slots, note: parsed.data.note } } : parsed;
    }
    case "decline":
    case "cancel": {
      const parsed = parseClose({ note });
      return parsed.ok ? { ok: true, change: { action: intent, note: parsed.data.note } } : parsed;
    }
    default:
      return { ok: false, errors: { _form: "Acción no válida." } };
  }
}

/** Demo mode: the sample proposal answers like a real one, but nothing is stored or sent. */
function demoAnswer(party: MeetingParty, formData: FormData): MeetingResponseState {
  const now = new Date();
  const meeting = demoMeeting(now);
  const parsed = changeFromForm(formData, meeting.format);
  if (!parsed.ok) return { status: "error", message: parsed.errors._form ?? "Revisa los campos marcados.", errors: parsed.errors };
  const applied = applyChange(meeting, party, parsed.change, now);
  if (!applied.ok) return { status: "error", message: applied.error };
  const { patch } = applied;
  const updated = {
    ...meeting,
    status: patch.status,
    proposedBy: patch.proposed_by ?? meeting.proposedBy,
    slots: patch.slots ?? meeting.slots,
    confirmedStart: patch.confirmed_start ?? meeting.confirmedStart,
    location: patch.location ?? meeting.location,
    responseNote: patch.response_note,
    closedBy: patch.closed_by === undefined ? meeting.closedBy : patch.closed_by,
    sequence: patch.sequence,
  };
  const owner = { id: "demo", name: DEMO_CARD.fullName, slug: DEMO_CARD.slug, email: "alex@example.com" };
  return { status: "done", action: parsed.change.action, view: toMeetingView(updated, owner, party, now), demo: true };
}

/** Answers a meeting from its signed link (/reunion/<id>/<signature>). */
export async function respondMeetingAction(
  rawId: string,
  signature: string,
  _prev: MeetingResponseState,
  formData: FormData,
): Promise<MeetingResponseState> {
  if (rawId === DEMO_MEETING_ID && !isSupabaseConfigured()) {
    const party: MeetingParty = signature === "invitado" ? "guest" : "owner";
    return demoAnswer(party, formData);
  }

  // One meeting, one rate-limit bucket, whatever the case of the link.
  const id = String(rawId).toLowerCase();
  const party = verifyMeetingSignature(id, String(signature));
  if (!party) return { status: "error", message: INVALID_LINK };

  const requestHeaders = await headers();
  if (!(await ipLimiter.check(clientRateKey(requestHeaders))).ok || !(await meetingLimiter.check(id)).ok) {
    return { status: "error", message: "Demasiados cambios seguidos. Espera unos minutos." };
  }

  const record = await getMeetingRecord(id);
  if (!record) return { status: "error", message: "No encontramos esta reunión. Puede que ya se haya borrado." };

  // The meeting's format decides how the "where" field is read.
  const parsed = changeFromForm(formData, record.meeting.format);
  if (!parsed.ok) return { status: "error", message: parsed.errors._form ?? "Revisa los campos marcados.", errors: parsed.errors };

  const result = await changeMeeting(record, party, parsed.change);
  if (!result.ok) return { status: "error", message: result.error };

  after(result.emails);
  const { meeting } = result.record;
  // A confirmed meeting shows the guest how to reach the owner.
  const owner = party === "guest" && meeting.status === "confirmed" ? await withOwnerEmail(result.record.owner) : result.record.owner;
  return { status: "done", action: parsed.change.action, view: toMeetingView(meeting, owner, party, new Date()) };
}
