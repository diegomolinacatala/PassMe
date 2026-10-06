import { z } from "zod";
import { DEFAULT_DURATION, isSafeText, MEETING_DURATIONS, MEETING_FORMATS, videoLinkSchema, type MeetingDuration, type MeetingFormat } from "./schema";
import { DEFAULT_TIME_ZONE, dateKey, timeKey } from "./time";

/**
 * «Ajustes de reuniones» (UX audit P8.4): what a visitor may propose and the
 * owner's defaults. Isomorphic: the editor edits them, the public picker only
 * offers what they allow, and the server action checks every proposal again.
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

const isFormat = (v: unknown): v is MeetingFormat => typeof v === "string" && (MEETING_FORMATS as readonly string[]).includes(v);
const isWeekday = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 7;

/** Sorted, unique, in the canonical order. */
function normalize<T>(values: ReadonlyArray<T>, order: ReadonlyArray<T>): T[] {
  return order.filter((value) => values.includes(value));
}

/**
 * Lenient read of what's stored (or what the public card carries): each field
 * falls back to its default on its own, so an old or odd row never breaks the
 * picker. Saving goes through the strict schema below.
 */
export function parseMeetingSettings(raw: unknown): MeetingSettings {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_MEETING_SETTINGS;
  const formats = Array.isArray(source.formats) ? normalize(source.formats.filter(isFormat), MEETING_FORMATS) : [];
  const weekdays = Array.isArray(source.weekdays) ? normalize(source.weekdays.filter(isWeekday), WEEKDAYS) : [];
  const start = typeof source.start === "string" && RANGE_STARTS.includes(source.start) ? source.start : d.start;
  const end = typeof source.end === "string" && RANGE_ENDS.includes(source.end) ? source.end : d.end;
  const range = start < end ? { start, end } : { start: d.start, end: d.end };
  const duration = (MEETING_DURATIONS as readonly unknown[]).includes(source.duration) ? (source.duration as MeetingDuration) : d.duration;
  const noticeMinutes = (NOTICE_OPTIONS as readonly unknown[]).includes(source.noticeMinutes) ? (source.noticeMinutes as number) : d.noticeMinutes;
  const video = typeof source.videoLink === "string" ? videoLinkSchema.safeParse(source.videoLink) : null;
  const place = typeof source.place === "string" && source.place.length <= PLACE_MAX && isSafeText(source.place) ? source.place.trim() : "";
  return {
    formats: formats.length > 0 ? formats : d.formats,
    weekdays: weekdays.length > 0 ? weekdays : d.weekdays,
    ...range,
    duration,
    noticeMinutes,
    videoLink: video?.success ? video.data : "",
    place,
  };
}

/** Strict validation when the owner saves (messages for the editor). */
export const meetingSettingsSchema = z
  .object({
    formats: z.array(z.enum(MEETING_FORMATS)).min(1, "Deja al menos una forma de veros.").max(3),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1, "Elige al menos un día.").max(7),
    start: z.string().refine((v) => RANGE_STARTS.includes(v), "Elige una hora de la lista."),
    end: z.string().refine((v) => RANGE_ENDS.includes(v), "Elige una hora de la lista."),
    duration: z.number().refine((v) => (MEETING_DURATIONS as readonly number[]).includes(v), "Elige una duración de la lista."),
    noticeMinutes: z.number().refine((v) => (NOTICE_OPTIONS as readonly number[]).includes(v), "Elige una antelación de la lista."),
    videoLink: videoLinkSchema,
    place: z
      .string()
      .max(PLACE_MAX * 2)
      .transform((v) => v.trim())
      .refine((v) => v.length <= PLACE_MAX, `Como mucho ${PLACE_MAX} caracteres.`)
      .refine((v) => !v || isSafeText(v), "Escribe solo el sitio: sin enlaces ni teléfonos."),
  })
  .refine((s) => s.start < s.end, { path: ["end"], message: "Tiene que ser más tarde que la primera hora." })
  .transform(
    (s): MeetingSettings => ({
      ...s,
      formats: normalize(s.formats, MEETING_FORMATS),
      weekdays: normalize(s.weekdays, WEEKDAYS),
      duration: s.duration as MeetingDuration,
    }),
  );

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
