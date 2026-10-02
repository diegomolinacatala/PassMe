import type { CalendarEvent } from "./calendar";
import { FORMAT_LABELS, type MeetingFormat } from "./schema";
import type { MeetingParty, MeetingState } from "./state";
import { addMinutes, formatDay, formatTime, timeZoneCity } from "./time";

/** A meeting proposal as the app works with it (see meeting_requests). */
export interface Meeting extends MeetingState {
  id: string;
  format: MeetingFormat;
  /** Place (in person) or video link (set by whoever confirms). */
  location: string;
  timeZone: string;
  topic: string;
  guest: {
    name: string;
    email: string;
    phone: string | null;
    company: string;
  };
  /** Words from whoever declined or proposed other times. */
  responseNote: string;
  closedBy: MeetingParty | null;
  source: "direct" | "qr" | "share";
  createdAt: string;
  updatedAt: string;
}

/** The card owner, as the meeting flow needs them. */
export interface MeetingOwner {
  id: string;
  name: string;
  slug: string;
  /** Login email; only revealed to the guest once the meeting is confirmed. */
  email: string | null;
}

export function formatDuration(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`;
}

/** "En persona · Café Central", "Videollamada", "Llamada al +34 600 000 000". */
export function describeWhere(meeting: { format: MeetingFormat; location: string; guest: { phone: string | null } }): string {
  switch (meeting.format) {
    case "in_person":
      return meeting.location ? `${FORMAT_LABELS.in_person} · ${meeting.location}` : FORMAT_LABELS.in_person;
    case "video":
      return meeting.location ? `${FORMAT_LABELS.video} · ${meeting.location}` : FORMAT_LABELS.video;
    case "phone":
      return meeting.guest.phone ? `${FORMAT_LABELS.phone} al ${meeting.guest.phone}` : FORMAT_LABELS.phone;
  }
}

/** "martes, 7 de octubre · 10:00–10:30 (hora de Madrid)" */
export function describeWhen(start: string, durationMinutes: number, timeZone: string): string {
  const end = addMinutes(start, durationMinutes);
  return `${formatDay(start, timeZone)} · ${formatTime(start, timeZone)}–${formatTime(end, timeZone)} (hora de ${timeZoneCity(timeZone)})`;
}

/** "el martes 7 de octubre a las 10:00" */
export function describeWhenInline(start: string, timeZone: string): string {
  return `el ${formatDay(start, timeZone).replace(",", "")} a las ${formatTime(start, timeZone)}`;
}

export function displayName(person: { name: string; company?: string }): string {
  return person.company ? `${person.name} (${person.company})` : person.name;
}

/**
 * The confirmed meeting as a calendar event, from `recipient`'s point of view
 * (their copy is titled with the other person's name). The signed link stays
 * out of it: calendars get shared, and the link lets anyone answer.
 */
export function meetingEvent(
  meeting: Meeting,
  owner: { name: string; email: string },
  recipient: MeetingParty,
  options: { uidDomain: string },
): CalendarEvent {
  const start = meeting.confirmedStart ?? meeting.slots[0]!;
  const other = recipient === "owner" ? meeting.guest.name : owner.name;
  const contact =
    recipient === "owner"
      ? [meeting.guest.email, meeting.guest.phone].filter(Boolean).join(" · ")
      : owner.email;
  const description = [
    // The topic is the visitor's free text: only the owner's copy carries it.
    recipient === "owner" && meeting.topic ? `Tema: ${meeting.topic}` : "",
    `Con: ${recipient === "owner" ? displayName(meeting.guest) : owner.name} (${contact})`,
    meeting.format === "video" && !meeting.location ? "Videollamada: el enlace os lo pasáis por email." : "",
    "Agendada con PassMe.",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    uid: `${meeting.id}@${options.uidDomain}`,
    sequence: meeting.sequence,
    start,
    end: addMinutes(start, meeting.durationMinutes),
    summary: `Reunión con ${other}`,
    description,
    location: meeting.format === "phone" ? describeWhere(meeting) : meeting.location,
    url: "",
    organizer: { name: owner.name, email: owner.email },
    attendee: { name: meeting.guest.name, email: meeting.guest.email },
  };
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}
