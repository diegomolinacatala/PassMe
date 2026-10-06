/**
 * Dates and times for meeting proposals. Isomorphic and dependency-free: the
 * picker runs in the browser, validation and emails on the server, and both
 * must agree on what "Tuesday at 10:00 in Madrid" means.
 *
 * Instants travel as ISO strings in UTC; every proposal also carries the IANA
 * time zone it was made in (the visitor's). Since P8.1 the card also has the
 * owner's zone: each side sees its own, and the other's in brackets when they
 * differ ("10:00 (09:00, hora de Canarias)").
 */

export const DEFAULT_TIME_ZONE = "Europe/Madrid";
const LOCALE = "es-ES";

export interface TimeGroup {
  label: string;
  times: ReadonlyArray<string>;
  /** Early and late times: folded until asked for. */
  folded?: boolean;
}

/** Times of day the picker offers, every half hour. */
export const TIME_GROUPS: ReadonlyArray<TimeGroup> = [
  { label: "Por la mañana", times: halfHours(9, 14) },
  { label: "Por la tarde", times: halfHours(14, 20) },
  { label: "Más temprano o más tarde", times: ["08:00", "08:30", "20:00", "20:30"], folded: true },
];

/** Half hours still free in the usual times for the picker to open on a day: five hours, so from 15:00 on it's tomorrow. */
const OPENING_MIN_FREE = 10;

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
  /** Saturday or Sunday: still pickable, just quieter. */
  weekend: boolean;
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
    weekend: [0, 6].includes(noon.getUTCDay()),
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

/**
 * The day the picker opens on: the first weekday with enough of the usual
 * times still free (after 15:00, tomorrow; on a Friday evening or a weekend,
 * Monday). Falls back to the first day.
 */
export function openingDayKey(now: Date, timeZone: string, days: ReadonlyArray<PickerDay>): string {
  const usual = TIME_GROUPS.filter((group) => !group.folded).flatMap((group) => group.times);
  const free = (key: string) => usual.filter((time) => (zonedTimeToUtc(key, time, timeZone)?.getTime() ?? 0) > now.getTime()).length;
  return days.find((day) => !day.weekend && free(day.key) >= OPENING_MIN_FREE)?.key ?? days[0]!.key;
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

/** Spanish names for the zones people here meet in; never "Canary" or "New York". */
const ZONE_NAMES: Record<string, string> = {
  "Europe/Madrid": "Madrid",
  "Atlantic/Canary": "Canarias",
  "Africa/Ceuta": "Ceuta",
  "Europe/Lisbon": "Lisboa",
  "Atlantic/Madeira": "Madeira",
  "Atlantic/Azores": "Azores",
  "Europe/London": "Londres",
  "Europe/Dublin": "Dublín",
  "Europe/Paris": "París",
  "Europe/Brussels": "Bruselas",
  "Europe/Amsterdam": "Ámsterdam",
  "Europe/Berlin": "Berlín",
  "Europe/Zurich": "Zúrich",
  "Europe/Rome": "Roma",
  "Europe/Vienna": "Viena",
  "Europe/Prague": "Praga",
  "Europe/Warsaw": "Varsovia",
  "Europe/Stockholm": "Estocolmo",
  "Europe/Copenhagen": "Copenhague",
  "Europe/Oslo": "Oslo",
  "Europe/Helsinki": "Helsinki",
  "Europe/Athens": "Atenas",
  "Europe/Istanbul": "Estambul",
  "Europe/Moscow": "Moscú",
  "Europe/Andorra": "Andorra",
  "Africa/Casablanca": "Casablanca",
  "America/New_York": "Nueva York",
  "America/Chicago": "Chicago",
  "America/Denver": "Denver",
  "America/Los_Angeles": "Los Ángeles",
  "America/Toronto": "Toronto",
  "America/Mexico_City": "Ciudad de México",
  "America/Guatemala": "Guatemala",
  "America/El_Salvador": "El Salvador",
  "America/Costa_Rica": "Costa Rica",
  "America/Panama": "Panamá",
  "America/Havana": "La Habana",
  "America/Santo_Domingo": "Santo Domingo",
  "America/Puerto_Rico": "Puerto Rico",
  "America/Bogota": "Bogotá",
  "America/Caracas": "Caracas",
  "America/Lima": "Lima",
  "America/Guayaquil": "Guayaquil",
  "America/La_Paz": "La Paz",
  "America/Santiago": "Santiago de Chile",
  "America/Argentina/Buenos_Aires": "Buenos Aires",
  "America/Buenos_Aires": "Buenos Aires",
  "America/Montevideo": "Montevideo",
  "America/Asuncion": "Asunción",
  "America/Sao_Paulo": "São Paulo",
  "Asia/Dubai": "Dubái",
  "Asia/Tokyo": "Tokio",
  "Asia/Shanghai": "Shanghái",
  "Asia/Singapore": "Singapur",
  "Australia/Sydney": "Sídney",
  UTC: "UTC",
  "Etc/UTC": "UTC",
};

/**
 * "hora de Madrid", "hora de Canarias"… For zones outside the list, Intl's own
 * Spanish name ("hora de Japón"), so no English city ever shows.
 */
export function timeZoneLabel(timeZone: string): string {
  const known = ZONE_NAMES[timeZone];
  if (known) return known === "UTC" ? "hora UTC" : `hora de ${known}`;
  for (const timeZoneName of ["longGeneric", "long"] as const) {
    try {
      const name = new Intl.DateTimeFormat(LOCALE, { timeZone, timeZoneName })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value;
      if (name && !/^GMT|^UTC/.test(name)) return name;
    } catch {
      // Unknown zone or option: try the next one.
    }
  }
  return "hora local";
}

/** Whether clocks in `a` and `b` read differently at `iso`. */
export function zonesDiffer(iso: string, a: string, b: string): boolean {
  if (a === b || !isTimeZone(a) || !isTimeZone(b)) return false;
  const date = new Date(iso);
  return dateKey(date, a) !== dateKey(date, b) || timeKey(date, a) !== timeKey(date, b);
}

/** `iso` as `other` reads it ("09:00, hora de Canarias"), or null when it's the same as in `timeZone`. */
export function otherZoneTime(iso: string, timeZone: string, other: string | null | undefined): string | null {
  if (!other || !zonesDiffer(iso, timeZone, other)) return null;
  const date = new Date(iso);
  const sameDay = dateKey(date, timeZone) === dateKey(date, other);
  return `${sameDay ? formatTime(iso, other) : formatSlotShort(iso, other)}, ${timeZoneLabel(other)}`;
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}
