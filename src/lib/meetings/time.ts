/**
 * Dates and times for meeting proposals. Isomorphic and dependency-free: the
 * picker runs in the browser, validation and emails on the server, and both
 * must agree on what "Tuesday at 10:00 in Madrid" means.
 *
 * Instants travel as ISO strings in UTC; every proposal also carries the IANA
 * time zone it was made in, and is always shown in that zone (the two people
 * just met, so they're normally in the same place).
 */

export const DEFAULT_TIME_ZONE = "Europe/Madrid";
const LOCALE = "es-ES";

/** Times of day the picker offers, every half hour. */
export const TIME_GROUPS: ReadonlyArray<{ label: string; times: ReadonlyArray<string> }> = [
  { label: "Por la mañana", times: halfHours(9, 14) },
  { label: "Por la tarde", times: halfHours(14, 20) },
];

function halfHours(from: number, to: number): string[] {
  const times: string[] = [];
  for (let hour = from; hour < to; hour += 1) {
    for (const minute of ["00", "30"]) times.push(`${String(hour).padStart(2, "0")}:${minute}`);
  }
  return times;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The zone's canonical IANA name ("europe/madrid" → "Europe/Madrid"), or null if unknown. */
export function canonicalTimeZone(value: unknown): string | null {
  if (!isTimeZone(value)) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
}

/** The browser's zone, or Madrid when it can't tell. */
export function localTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(zone) ? zone : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** What a clock in `timeZone` reads at `instant`. */
function wallClock(instant: Date, timeZone: string): WallClock {
  let format = partsFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, format);
  }
  const parts = format.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/** Milliseconds `timeZone` is ahead of UTC at `instant`. */
function offsetAt(instant: number, timeZone: string): number {
  const clock = wallClock(new Date(instant), timeZone);
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant at which a clock in `timeZone` reads `date` (YYYY-MM-DD) at
 * `time` (HH:MM). A time skipped by a daylight-saving jump resolves to the
 * same distance after the jump, as calendars do. Null for malformed input.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t || !isTimeZone(timeZone)) return null;
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  // Date.UTC rolls 2026-13-01 over to January: only real calendar days pass.
  if (Number.isNaN(wall) || new Date(wall).toISOString().slice(0, 10) !== date) return null;
  // Two passes settle the offset on either side of a daylight-saving change.
  const first = wall - offsetAt(wall, timeZone);
  return new Date(wall - offsetAt(first, timeZone));
}

/** "YYYY-MM-DD" of `instant` in `timeZone`. */
export function dateKey(instant: Date, timeZone: string): string {
  const { year, month, day } = wallClock(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "HH:MM" of `instant` in `timeZone`. */
export function timeKey(instant: Date, timeZone: string): string {
  const { hour, minute } = wallClock(instant, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface PickerDay {
  key: string;
  /** "Hoy", "Mañana" or the short weekday ("lun"). */
  label: string;
  /** Day of the month. */
  day: number;
  /** Short month ("oct"). */
  month: string;
  /** Full name for screen readers: "martes, 7 de octubre". */
  long: string;
}

const strip = (value: string) => value.replace(/\.$/, "");
const SHORT_WEEKDAY = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: "UTC" });
const SHORT_MONTH = new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone: "UTC" });
const LONG_DAY = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** A calendar day ("YYYY-MM-DD") for the picker; `label` overrides the short weekday. */
export function pickerDay(key: string, label?: string): PickerDay {
  // Noon UTC of the calendar day: formatting it in UTC can never slip to a neighbour.
  const noon = new Date(`${key}T12:00:00Z`);
  return {
    key,
    label: label ?? strip(SHORT_WEEKDAY.format(noon)),
    day: noon.getUTCDate(),
    month: strip(SHORT_MONTH.format(noon)),
    long: LONG_DAY.format(noon),
  };
}

/** The next `count` days in `timeZone`, starting today. */
export function upcomingDays(now: Date, timeZone: string, count: number): PickerDay[] {
  const today = wallClock(now, timeZone);
  return Array.from({ length: count }, (_, i) => {
    const key = new Date(Date.UTC(today.year, today.month - 1, today.day + i, 12)).toISOString().slice(0, 10);
    return pickerDay(key, i === 0 ? "Hoy" : i === 1 ? "Mañana" : undefined);
  });
}

function formatter(options: Intl.DateTimeFormatOptions, timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: isTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE });
}

/** "martes, 7 de octubre" */
export function formatDay(iso: string, timeZone: string): string {
  return formatter({ weekday: "long", day: "numeric", month: "long" }, timeZone).format(new Date(iso));
}

/** "10:00" */
export function formatTime(iso: string, timeZone: string): string {
  return formatter({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, timeZone).format(new Date(iso));
}

/** "martes, 7 de octubre, 10:00" */
export function formatSlot(iso: string, timeZone: string): string {
  return `${formatDay(iso, timeZone)}, ${formatTime(iso, timeZone)}`;
}

/** "mar 7 oct · 10:00" */
export function formatSlotShort(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const parts = formatter({ weekday: "short", day: "numeric", month: "short" }, timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => strip(parts.find((p) => p.type === type)?.value ?? "");
  return `${get("weekday")} ${get("day")} ${get("month")} · ${formatTime(iso, timeZone)}`;
}

/** "Madrid" for "Europe/Madrid", "Nueva York"-style names are left as the zone's city. */
export function timeZoneCity(timeZone: string): string {
  const city = timeZone.split("/").pop() ?? timeZone;
  return city.replace(/_/g, " ");
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}
