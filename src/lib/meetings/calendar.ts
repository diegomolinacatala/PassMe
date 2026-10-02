/**
 * Calendar formats for a confirmed meeting: an iCalendar file (RFC 5545/5546)
 * that Apple Calendar, Outlook and Gmail understand, and an "add to Google
 * Calendar" link. Pure, so it can be unit tested.
 */
import { escapeText, foldLine } from "@/lib/card/vcard";

export interface CalendarPerson {
  name: string;
  email: string;
}

export interface CalendarEvent {
  /** Stable across updates: the same meeting is one event. */
  uid: string;
  /** Bumped on every change so calendars apply them in order. */
  sequence: number;
  start: string;
  end: string;
  summary: string;
  description: string;
  location: string;
  url: string;
  organizer: CalendarPerson;
  attendee: CalendarPerson;
}

/**
 * PUBLISH: a plain event the recipient adds to their calendar (both copies:
 * an iTIP REQUEST from an address other than the organizer's gets flagged,
 * and some calendars would add it unasked). CANCEL: withdraws it.
 * REQUEST is kept for completeness (an invitation awaiting an answer).
 */
export type CalendarMethod = "REQUEST" | "PUBLISH" | "CANCEL";

/** 20261007T080000Z */
function utc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Parameter values can't contain quotes; quoted, they may contain , ; : */
function param(value: string): string {
  return `"${value.replace(/["\r\n]/g, "").trim()}"`;
}

function mailto(email: string): string {
  return `mailto:${email.replace(/[\r\n;:,\s]/g, "")}`;
}

export function buildIcs(event: CalendarEvent, method: CalendarMethod, now: Date = new Date()): string {
  const cancelled = method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PassMe//Agendar reunion//ES",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${utc(now.toISOString())}`,
    `DTSTART:${utc(event.start)}`,
    `DTEND:${utc(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url.replace(/[\r\n]/g, "")}`);
  lines.push(`ORGANIZER;CN=${param(event.organizer.name)}:${mailto(event.organizer.email)}`);
  // RFC 5546: a PUBLISH carries no attendees.
  if (method !== "PUBLISH") {
    lines.push(
      `ATTENDEE;CN=${param(event.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=${cancelled ? "DECLINED" : "NEEDS-ACTION"};RSVP=FALSE:${mailto(event.attendee.email)}`,
    );
  }
  lines.push(`STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`, "TRANSP:OPAQUE");
  if (!cancelled) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(event.summary)}`, "TRIGGER:-PT30M", "END:VALARM");
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Opens Google Calendar with the event filled in (the user saves it to their own calendar). */
export function googleCalendarUrl(event: Pick<CalendarEvent, "start" | "end" | "summary" | "description" | "location">): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.summary,
    dates: `${utc(event.start)}/${utc(event.end)}`,
    details: event.description,
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
