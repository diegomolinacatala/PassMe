import { DEMO_CARD } from "@/lib/card/demo";
import { getMeetingRecord, withOwnerEmail } from "@/lib/data/meetings";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { buildIcs } from "@/lib/meetings/calendar";
import { verifyMeetingSignature } from "@/lib/meetings/links";
import { meetingEvent, type Meeting } from "@/lib/meetings/model";
import type { MeetingParty } from "@/lib/meetings/state";
import { demoMeetingById, isDemoMeetingId } from "@/lib/meetings/view";

const HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8; method=PUBLISH",
  "Content-Disposition": 'attachment; filename="reunion.ics"',
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
};

interface Loaded {
  meeting: Meeting;
  owner: { name: string; email: string };
  party: MeetingParty;
}

async function load(rawId: string, signature: string, host: string): Promise<Loaded | null> {
  if (isDemoMeetingId(rawId) && !isSupabaseConfigured()) {
    const demo = demoMeetingById(rawId, new Date());
    return {
      meeting: { ...demo, status: "confirmed", confirmedStart: demo.confirmedStart ?? demo.slots[0]! },
      owner: { name: DEMO_CARD.fullName, email: "alex@example.com" },
      party: signature === "invitado" ? "guest" : "owner",
    };
  }
  const id = rawId.toLowerCase();
  const party = verifyMeetingSignature(id, signature);
  const record = party ? await getMeetingRecord(id) : null;
  if (!party || !record || record.meeting.status !== "confirmed") return null;
  const owner = await withOwnerEmail(record.owner);
  return { meeting: record.meeting, owner: { name: owner.name, email: owner.email ?? `hola@${host}` }, party };
}

/**
 * The confirmed meeting as an .ics file, for the page's "Apple / Outlook"
 * button. Read-only, so a plain GET is fine (mail scanners can't change anything).
 */
export async function GET(_request: Request, { params }: RouteContext<"/reunion/[id]/[sig]/invitacion.ics">) {
  const { id, sig } = await params;
  const host = new URL(getSiteUrl()).host;
  const loaded = await load(id, sig, host);
  if (!loaded) return new Response("No disponible", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const ics = buildIcs(meetingEvent(loaded.meeting, loaded.owner, loaded.party, { uidDomain: host }), "PUBLISH");
  return new Response(ics, { headers: HEADERS });
}
