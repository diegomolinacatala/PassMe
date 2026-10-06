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
  /** Login email: where PassMe writes to the owner. */
  email: string | null;
  /**
   * The email the guest gets to reach the owner: the card's first visible
   * email, or the login one. Only revealed to the guest once confirmed.
   */
  contactEmail?: string | null;
}

/** The address the guest sees and replies to. */
export function ownerContactEmail(owner: Pick<MeetingOwner, "email" | "contactEmail">): string | null {
  return owner.contactEmail || owner.email;
}

export function formatDuration(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`;
}

/** The place is a map link ("Cómo llegar"), only ever shown as a link on signed pages and in the owner's calendar. */
export function hasMapLink(meeting: { format: MeetingFormat; location: string }): boolean {
  return meeting.format === "in_person" && /^https:\/\//.test(meeting.location);
}

/** "En persona · Café Central", "Videollamada", "Llamada al +34 600 000 000". A map link stays out. */
export function describeWhere(meeting: { format: MeetingFormat; location: string; guest: { phone: string | null } }): string {
  switch (meeting.format) {
    case "in_person":
      return meeting.location && !hasMapLink(meeting) ? `${FORMAT_LABELS.in_person} · ${meeting.location}` : FORMAT_LABELS.in_person;
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

/** Who sees a calendar copy, and what it says about the other person. */
interface DescriptionInput {
  format: MeetingFormat;
  location: string;
  topic: string;
  guest: { name: string; company: string; email: string | null; phone: string | null };
}

/**
 * The calendar text, the same in the .ics and the Google link: one fact per
 * line ("Con: …", "Email: …", "Teléfono: …", "Tema: …"). The topic and the
 * guest's phone are the visitor's own words: only the owner's copy has them.
 */
export function meetingDescription(meeting: DescriptionInput, recipient: MeetingParty, owner: { name: string; email: string | null }): string {
  const toOwner = recipient === "owner";
  return [
    `Con: ${toOwner ? displayName(meeting.guest) : owner.name}`,
    toOwner ? (meeting.guest.email ? `Email: ${meeting.guest.email}` : "") : owner.email ? `Email: ${owner.email}` : "",
    toOwner && meeting.guest.phone ? `Teléfono: ${meeting.guest.phone}` : "",
    toOwner && meeting.topic ? `Tema: ${meeting.topic}` : "",
    meeting.format === "video" && !meeting.location ? "Videollamada: el enlace os lo pasáis por email." : "",
    "Agendada con PassMe.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** LOCATION of each side's calendar copy: the map link only in the owner's. */
export function calendarLocation(meeting: { format: MeetingFormat; location: string; guest: { phone: string | null } }, recipient: MeetingParty): string {
  if (meeting.format === "phone") return describeWhere(meeting);
  if (hasMapLink(meeting) && recipient !== "owner") return describeWhere(meeting);
  return meeting.location;
}

/** Reminder before the start: time to get there in person, a nudge for a call. */
export function alarmMinutes(format: MeetingFormat): number {
  return format === "in_person" ? 60 : 10;
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
  return {
    uid: `${meeting.id}@${options.uidDomain}`,
    sequence: meeting.sequence,
    start,
    end: addMinutes(start, meeting.durationMinutes),
    summary: `Reunión con ${other}`,
    description: meetingDescription(meeting, recipient, owner),
    alarmMinutes: alarmMinutes(meeting.format),
    location: calendarLocation(meeting, recipient),
    url: "",
    organizer: { name: owner.name, email: owner.email },
    attendee: { name: meeting.guest.name, email: meeting.guest.email },
  };
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}
