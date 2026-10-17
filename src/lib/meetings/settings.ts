import { z } from "zod";
import { MEETING_DURATIONS, MEETING_FORMATS, type MeetingDuration, type MeetingFormat } from "./constants";
import {
  DEFAULT_MEETING_SETTINGS,
  NOTICE_OPTIONS,
  PLACE_MAX,
  RANGE_ENDS,
  RANGE_STARTS,
  WEEKDAYS,
  type MeetingSettings,
} from "./rules";
import { videoLinkSchema } from "./schema";
import { isSafeText } from "./text-safety";

/**
 * «Ajustes de reuniones» (UX audit P8.4): the zod side. The types, defaults
 * and the pure helpers the picker uses (slotAllowed, inRange, rulesOf…) live in
 * ./rules, which client components import so this library stays out of the
 * browser; they are re-exported here for the server and the tests.
 */
export * from "./rules";

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
