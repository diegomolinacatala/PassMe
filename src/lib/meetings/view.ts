import { googleCalendarUrl } from "./calendar";
import { calendarLocation, meetingDescription, ownerContactEmail, type Meeting, type MeetingOwner } from "./model";
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
    // The owner sees which email the guest will get; the guest, only once confirmed.
    owner: { name: owner.name, slug: owner.slug, email: party === "owner" || confirmed ? ownerContactEmail(owner) : null },
    responseNote: meeting.responseNote,
    closedBy: meeting.closedBy,
    actions: allowedActions(meeting, party, now),
  };
}

/** "Add to Google Calendar" for a confirmed meeting, from the viewer's side. */
export function viewGoogleCalendarUrl(view: MeetingView): string | null {
  if (!view.confirmedStart) return null;
  return googleCalendarUrl({
    start: view.confirmedStart,
    end: addMinutes(view.confirmedStart, view.durationMinutes),
    summary: `Reunión con ${view.party === "owner" ? view.guest.name : view.owner.name}`,
    description: meetingDescription(view, view.party, view.owner),
    location: calendarLocation(view, view.party),
  });
}

// --- Demo ---------------------------------------------------------------------

/** /reunion/demo/<side> shows a sample proposal (demo mode only: nothing is stored). */
export const DEMO_MEETING_ID = "demo";
/** The sample card's visible email (see DEMO_CARD): what the sample guest gets. */
export const DEMO_CONTACT_EMAIL = "alex@example.com";

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

/** Sample meetings in every state, at /reunion/<id>/<side> (demo mode only). */
export const DEMO_MEETING_IDS = ["demo", "demo-confirmada", "demo-contra", "demo-caducada", "demo-pasada"] as const;
export type DemoMeetingId = (typeof DEMO_MEETING_IDS)[number];

export function isDemoMeetingId(id: string): id is DemoMeetingId {
  return (DEMO_MEETING_IDS as ReadonlyArray<string>).includes(id);
}

const DAY_MS = 86_400_000;
const shiftDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();

/**
 * The sample meeting behind each demo id: the proposal to answer, a confirmed
 * meeting, the owner's counter-proposal (for the visitor), one whose times
 * have passed and one that already happened.
 */
export function demoMeetingById(id: DemoMeetingId, now: Date): Meeting {
  const pending = demoMeeting(now);
  switch (id) {
    case "demo":
      return pending;
    case "demo-confirmada": {
      const later = pending.slots.map((slot) => shiftDays(slot, 2));
      return {
        ...pending,
        id,
        status: "confirmed",
        slots: later,
        confirmedStart: later[0]!,
        sequence: 1,
        format: "video",
        location: "",
        topic: "Presentación del proyecto",
        guest: { name: "Jon Etxeberria", email: "jon@example.com", phone: null, company: "Kobalt" },
      };
    }
    case "demo-contra":
      return {
        ...pending,
        id,
        proposedBy: "owner",
        slots: pending.slots.map((slot) => shiftDays(slot, 1)),
        sequence: 1,
        responseNote: "Esa mañana no puedo, ¿te va alguna de estas?",
      };
    case "demo-caducada":
      return { ...pending, id, slots: pending.slots.map((slot) => shiftDays(slot, -7)) };
    case "demo-pasada": {
      const before = pending.slots.map((slot) => shiftDays(slot, -7));
      return { ...pending, id, status: "confirmed", slots: before, confirmedStart: before[0]!, sequence: 1 };
    }
  }
}

/** What the editor's "Reuniones" panel shows in demo mode: one to answer, one confirmed. */
export function demoOwnerMeetings(now: Date): Meeting[] {
  return [demoMeetingById("demo", now), demoMeetingById("demo-confirmada", now)];
}
