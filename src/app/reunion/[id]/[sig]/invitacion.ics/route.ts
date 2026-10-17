import { DEMO_CARD } from "@/lib/card/demo";
import { findMeetingRecord, withOwnerEmail } from "@/lib/data/meetings";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { buildIcs } from "@/lib/meetings/calendar";
import { verifyMeetingSignature } from "@/lib/meetings/links";
import { meetingEvent, type Meeting, type MeetingOwner } from "@/lib/meetings/model";
import { organizer } from "@/lib/meetings/service";
import type { MeetingParty } from "@/lib/meetings/state";
import { DEMO_CONTACT_EMAIL, demoMeetingById, isDemoMeetingId } from "@/lib/meetings/view";

const HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8; method=PUBLISH",
  "Content-Disposition": 'attachment; filename="reunion.ics"',
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
};

interface Loaded {
  meeting: Meeting;
  owner: MeetingOwner;
  party: MeetingParty;
}

/** "unavailable": nothing to serve (bad link, no such meeting, not confirmed). "error": the database failed; try again. */
async function load(rawId: string, signature: string): Promise<Loaded | "unavailable" | "error"> {
  if (isDemoMeetingId(rawId) && !isSupabaseConfigured()) {
    const demo = demoMeetingById(rawId, new Date());
    return {
      meeting: { ...demo, status: "confirmed", confirmedStart: demo.confirmedStart ?? demo.slots[0]! },
      owner: { id: "demo", name: DEMO_CARD.fullName, slug: DEMO_CARD.slug, email: "alex@example.com", contactEmail: DEMO_CONTACT_EMAIL },
      party: signature === "invitado" ? "guest" : "owner",
    };
  }
  const id = rawId.toLowerCase();
  const party = verifyMeetingSignature(id, signature);
  if (!party) return "unavailable";
  const lookup = await findMeetingRecord(id);
  if (lookup.status === "error") return "error";
  if (lookup.status === "missing" || lookup.record.meeting.status !== "confirmed") return "unavailable";
  return { meeting: lookup.record.meeting, owner: await withOwnerEmail(lookup.record.owner), party };
}

/**
 * The confirmed meeting as an .ics file, for the page's "Apple / Outlook"
 * button. Read-only, so a plain GET is fine (mail scanners can't change anything).
 * It is the same calendar copy the email carries (same organizer): the card's
 * visible email when it has one; only a card with no email link falls back to
 * the owner's account address, and only once the meeting is confirmed.
 */
export async function GET(_request: Request, { params }: RouteContext<"/reunion/[id]/[sig]/invitacion.ics">) {
  const { id, sig } = await params;
  const host = new URL(getSiteUrl()).host;
  const loaded = await load(id, sig);
  if (loaded === "error") {
    return new Response("No disponible ahora", { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "5" } });
  }
  if (loaded === "unavailable") return new Response("No disponible", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const { meeting, owner, party } = loaded;
  const ics = buildIcs(meetingEvent(meeting, organizer(owner, party), party, { uidDomain: host }), "PUBLISH");
  return new Response(ics, { headers: HEADERS });
}
