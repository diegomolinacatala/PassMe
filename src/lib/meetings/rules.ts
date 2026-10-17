import { DEFAULT_DURATION, MEETING_FORMATS, type MeetingDuration, type MeetingFormat } from "./constants";
import { DEFAULT_TIME_ZONE, dateKey, timeKey } from "./time";

/**
 * «Ajustes de reuniones» (UX audit P8.4) without zod: what a visitor may
 * propose and the owner's defaults. The public picker, the editor and the
 * server all read these; client components import this module (not ./settings,
 * which holds the zod schema) so the validation library stays out of the
 * browser bundle. ./settings re-exports everything here.
 *
 * Stored as jsonb in profiles.meeting_settings (migration 20261006120000);
 * '{}' means the defaults. The public card gets the rules only — the video
 * link and the place stay with the owner (get_public_card strips them).
 */

/** The public part: what the picker and the server enforce. */
export interface MeetingRules {
  formats: MeetingFormat[];
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  weekdays: number[];
  /** Proposals start from `start` and before `end` ("HH:MM", owner's zone). */
  start: string;
  end: string;
  /** Preselected length in the visitor's form. */
  duration: MeetingDuration;
  /** Minimum notice, in minutes. */
  noticeMinutes: number;
}

export interface MeetingSettings extends MeetingRules {
  /** Default video link (allowlisted hosts), offered when confirming a video call. */
  videoLink: string;
  /** Usual place, offered when confirming an in-person meeting. */
  place: string;
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const WEEKDAY_LABELS: Record<number, { short: string; long: string }> = {
  1: { short: "L", long: "lunes" },
  2: { short: "M", long: "martes" },
  3: { short: "X", long: "miércoles" },
  4: { short: "J", long: "jueves" },
  5: { short: "V", long: "viernes" },
  6: { short: "S", long: "sábado" },
  7: { short: "D", long: "domingo" },
};
export const NOTICE_OPTIONS = [0, 60, 120, 240, 720, 1440, 2880] as const;
/** Half hours the picker can show (08:00–20:30): the range lives inside them. */
export const RANGE_STARTS = halfHours("08:00", "20:30");
export const RANGE_ENDS = halfHours("08:30", "21:00");
export const PLACE_MAX = 120;

function halfHours(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = toMinutes(from); m <= toMinutes(to); m += 30) out.push(fromMinutes(m));
  return out;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h! * 60 + m!;
}

function fromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export const DEFAULT_MEETING_SETTINGS: MeetingSettings = {
  formats: [...MEETING_FORMATS],
  weekdays: [1, 2, 3, 4, 5],
  start: "09:00",
  end: "19:00",
  duration: DEFAULT_DURATION,
  noticeMinutes: 120,
  videoLink: "",
  place: "",
};

/** The public part of the settings. */
export function rulesOf(settings: MeetingSettings): MeetingRules {
  const { formats, weekdays, start, end, duration, noticeMinutes } = settings;
  return { formats, weekdays, start, end, duration, noticeMinutes };
}

/** ISO weekday (1 = Monday) of a "YYYY-MM-DD" day. */
export function isoWeekday(key: string): number {
  const day = new Date(`${key}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Whether a time of day ("HH:MM") is inside the owner's range. */
export function inRange(time: string, rules: Pick<MeetingRules, "start" | "end">): boolean {
  return time >= rules.start && time < rules.end;
}

/** Whether `iso` is a time the owner takes proposals for, read in their zone. */
export function slotAllowed(iso: string, rules: MeetingRules, timeZone: string, now: Date): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  if (date.getTime() < now.getTime() + rules.noticeMinutes * 60_000) return false;
  return rules.weekdays.includes(isoWeekday(dateKey(date, timeZone))) && inRange(timeKey(date, timeZone), rules);
}

/** "2 h", "1 día", "Sin mínimo"… for the notice options. */
export function noticeLabel(minutes: number): string {
  if (minutes === 0) return "Sin mínimo";
  if (minutes < 1440) return `${minutes / 60} h`;
  return minutes === 1440 ? "1 día" : `${minutes / 1440} días`;
}

/** "30 min", "1 h": a meeting length for labels and chips. */
export function formatDuration(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`;
}

/**
 * Field errors when a proposal breaks the owner's settings; null when it fits
 * (or the card has none). The server action runs it whatever the browser sent.
 */
export function proposalOutsideRules(
  card: { timeZone?: string; meetingRules?: MeetingRules | null; fullName: string },
  data: { slots: ReadonlyArray<string>; format: MeetingFormat },
  now: Date = new Date(),
): Record<string, string> | null {
  const rules = card.meetingRules;
  if (!rules) return null;
  const owner = card.fullName.split(/\s+/)[0] || card.fullName;
  if (!rules.formats.includes(data.format)) return { format: `${owner} no hace reuniones así. Elige otra forma.` };
  const zone = card.timeZone ?? DEFAULT_TIME_ZONE;
  if (!data.slots.every((slot) => slotAllowed(slot, rules, zone, now))) {
    return { slots: `Alguna hora no entra en los horarios de ${owner}. Elige otra.` };
  }
  return null;
}
