import { googleCalendarUrl } from "./calendar";
import { describeWhere, displayName, type Meeting, type MeetingOwner } from "./model";
import type { MeetingFormat } from "./schema";
import { allowedActions, meetingStage, openSlots, type MeetingAction, type MeetingParty, type MeetingStage, type MeetingStatus } from "./state";
import { addMinutes, dateKey, zonedTimeToUtc } from "./time";

/**
 * What one side of a meeting sees on its page. Built on the server: the owner
 * sees the visitor's contact; the visitor sees the owner's email only once
 * the meeting is confirmed.
 */
export interface MeetingView {
  id: string;
  party: MeetingParty;
  stage: MeetingStage;
  status: MeetingStatus;
  proposedBy: MeetingParty;
  slots: string[];
  openSlots: string[];
  confirmedStart: string | null;
  durationMinutes: number;
  format: MeetingFormat;
  location: string;
  timeZone: string;
  topic: string;
  guest: { name: string; company: string; email: string | null; phone: string | null };
  owner: { name: string; slug: string; email: string | null };
  responseNote: string;
  closedBy: MeetingParty | null;
  actions: MeetingAction[];
}

export function toMeetingView(meeting: Meeting, owner: MeetingOwner, party: MeetingParty, now: Date): MeetingView {
  const confirmed = meeting.status === "confirmed";
  return {
    id: meeting.id,
    party,
    stage: meetingStage(meeting, now),
    status: meeting.status,
    proposedBy: meeting.proposedBy,
    slots: [...meeting.slots],
    openSlots: openSlots(meeting, now),
    confirmedStart: meeting.confirmedStart,
    durationMinutes: meeting.durationMinutes,
    format: meeting.format,
    location: meeting.location,
    timeZone: meeting.timeZone,
    topic: meeting.topic,
    guest: {
      name: meeting.guest.name,
      company: meeting.guest.company,
      email: meeting.guest.email,
      phone: meeting.guest.phone,
    },
    owner: { name: owner.name, slug: owner.slug, email: party === "guest" && confirmed ? owner.email : null },
    responseNote: meeting.responseNote,
    closedBy: meeting.closedBy,
    actions: allowedActions(meeting, party, now),
  };
}

/** "Add to Google Calendar" for a confirmed meeting, from the viewer's side. */
export function viewGoogleCalendarUrl(view: MeetingView): string | null {
  if (!view.confirmedStart) return null;
  const other = view.party === "owner" ? displayName(view.guest) : view.owner.name;
  return googleCalendarUrl({
    start: view.confirmedStart,
    end: addMinutes(view.confirmedStart, view.durationMinutes),
    summary: `Reunión con ${view.party === "owner" ? view.guest.name : view.owner.name}`,
    description: [view.topic ? `Tema: ${view.topic}` : "", `Con: ${other}`, "Agendada con PassMe."].filter(Boolean).join("\n"),
    location: view.format === "phone" ? describeWhere(view) : view.location,
  });
}

// --- Demo ---------------------------------------------------------------------

/** /reunion/demo/<side> shows a sample proposal (demo mode only: nothing is stored). */
export const DEMO_MEETING_ID = "demo";

/** A proposal for the next weekday at 10:00 and 12:30 (Madrid), from a sample visitor. */
export function demoMeeting(now: Date): Meeting {
  const zone = "Europe/Madrid";
  let day = new Date(now.getTime() + 86_400_000);
  // Skip weekends: a sample meeting on a Sunday would look odd.
  while ([0, 6].includes(new Date(`${dateKey(day, zone)}T12:00:00Z`).getUTCDay())) day = new Date(day.getTime() + 86_400_000);
  const key = dateKey(day, zone);
  const slot = (time: string) => zonedTimeToUtc(key, time, zone)!.toISOString();
  return {
    id: DEMO_MEETING_ID,
    status: "pending",
    proposedBy: "guest",
    slots: [slot("10:00"), slot("12:30")],
    confirmedStart: null,
    durationMinutes: 30,
    sequence: 0,
    format: "in_person",
    location: "Café Central, Valencia",
    timeZone: zone,
    topic: "Un café para hablar del rediseño de la web",
    guest: { name: "Lucía Martín", email: "lucia@example.com", phone: "+34 600 000 000", company: "Mirador" },
    responseNote: "",
    closedBy: null,
    source: "qr",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** What the editor's "Reuniones" panel shows in demo mode: one to answer, one confirmed. */
export function demoOwnerMeetings(now: Date): Meeting[] {
  const pending = demoMeeting(now);
  const later = pending.slots.map((slot) => new Date(new Date(slot).getTime() + 2 * 86_400_000).toISOString());
  return [
    pending,
    {
      ...pending,
      id: "demo-confirmada",
      status: "confirmed",
      slots: later,
      confirmedStart: later[0]!,
      sequence: 1,
      format: "video",
      location: "",
      topic: "Presentación del proyecto",
      guest: { name: "Jon Etxeberria", email: "jon@example.com", phone: null, company: "Kobalt" },
    },
  ];
}

