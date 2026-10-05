/**
 * "Agendar reunión": what a visitor proposes and what each side answers.
 * Isomorphic — the forms and the server actions share these rules.
 * Keep the limits in sync with supabase/migrations/20261002120000_meeting_requests.sql.
 */
import { z } from "zod";
import { normalizeLinkValue, parseHttpUrl } from "@/lib/card/links";
import { line, paragraph, toFieldErrors, type FieldErrors } from "@/lib/card/schema";
import { canonicalTimeZone, DEFAULT_TIME_ZONE } from "./time";

export const MEETING_LIMITS = {
  name: 80,
  email: 254,
  phone: 30,
  company: 80,
  topic: 140,
  location: 120,
  videoLink: 300,
  note: 300,
} as const;

export const MEETING_FORMATS = ["in_person", "video", "phone"] as const;
export type MeetingFormat = (typeof MEETING_FORMATS)[number];

export const FORMAT_LABELS: Record<MeetingFormat, string> = {
  in_person: "En persona",
  video: "Videollamada",
  phone: "Llamada",
};

export const MEETING_DURATIONS = [15, 30, 45, 60] as const;
export type MeetingDuration = (typeof MEETING_DURATIONS)[number];
export const DEFAULT_DURATION: MeetingDuration = 30;

export const MAX_SLOTS = 3;
/** Proposals reach this far ahead. */
export const HORIZON_DAYS = 60;
/** Times sit on quarter hours (the picker offers half hours). */
const STEP_MINUTES = 15;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
/** Links have no business in a name: a form anyone can fill must not mail them to an owner. */
const LINKISH_RE = /https?:|www\.|:\/\/|@|[\p{L}\d]\.\p{L}{2,}/iu;
/** Nine or more digits, maybe split by single spaces, dots or dashes: a phone number. */
const PHONEISH_RE = /(?:\d[\s.-]?){9,}/;
/** Letters, marks and the punctuation real names use (O'Connor, Jean-Luc, Mª José, J. R.). */
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

const noLinks = (s: string) => !LINKISH_RE.test(s);

/** Free text that may reach someone's inbox: no links, emails, domains or phone numbers. */
export function isSafeText(s: string): boolean {
  return noLinks(s) && !PHONEISH_RE.test(s);
}

export function isSafeName(s: string): boolean {
  return NAME_RE.test(s) && isSafeText(s);
}

const name = line(MEETING_LIMITS.name)
  .pipe(z.string().min(1, "Dinos cómo te llamas."))
  .refine(isSafeName, "Escribe solo tu nombre.");

const company = line(MEETING_LIMITS.company).refine(isSafeText, "Sin enlaces ni teléfonos, por favor.");
const place = line(MEETING_LIMITS.location).refine(isSafeText, "Escribe solo el sitio, sin enlaces ni teléfonos.");

/** One contact value normalized like the card's own links (email or phone). */
function contactValue(kind: "email" | "phone", max: number) {
  return z
    .string()
    .max(max * 2)
    .transform((raw, ctx) => {
      const value = raw.trim();
      if (!value) return null;
      const normalized = normalizeLinkValue(kind, value);
      if (!normalized.ok || normalized.value.length > max) {
        ctx.addIssue({ code: "custom", message: normalized.ok ? "Demasiado largo." : normalized.error });
        return z.NEVER;
      }
      // Legal in theory, but only ever seen in attempts to smuggle extra headers.
      if (kind === "email" && /[?&=%#/]/.test(normalized.value)) {
        ctx.addIssue({ code: "custom", message: "Email no válido." });
        return z.NEVER;
      }
      return normalized.value;
    });
}

/**
 * 1–3 distinct future times on quarter hours, within the horizon. Returned
 * sorted, as canonical UTC ISO strings.
 */
export function slotsSchema(now: Date) {
  const horizon = now.getTime() + HORIZON_DAYS * 86_400_000;
  return z
    .array(z.string().max(40), { error: "Elige al menos una hora." })
    .transform((raw, ctx) => {
      const unique = new Set<string>();
      for (const value of raw) {
        const time = ISO_RE.test(value) ? new Date(value).getTime() : Number.NaN;
        if (Number.isNaN(time) || time % (STEP_MINUTES * 60_000) !== 0) {
          ctx.addIssue({ code: "custom", message: "Alguna hora no es válida." });
          return z.NEVER;
        }
        if (time <= now.getTime()) {
          ctx.addIssue({ code: "custom", message: "Alguna hora ya ha pasado. Elige otra." });
          return z.NEVER;
        }
        if (time > horizon) {
          ctx.addIssue({ code: "custom", message: `Propón fechas de los próximos ${HORIZON_DAYS} días.` });
          return z.NEVER;
        }
        unique.add(new Date(time).toISOString());
      }
      if (unique.size === 0) {
        ctx.addIssue({ code: "custom", message: "Elige al menos una hora." });
        return z.NEVER;
      }
      if (unique.size > MAX_SLOTS) {
        ctx.addIssue({ code: "custom", message: `Propón como mucho ${MAX_SLOTS} horas.` });
        return z.NEVER;
      }
      return [...unique].sort();
    });
}

const timeZone = z
  .string()
  .optional()
  .transform((value) => canonicalTimeZone(value) ?? DEFAULT_TIME_ZONE);

const duration = z.coerce
  .number({ error: "Elige una duración." })
  .refine((value): value is MeetingDuration => (MEETING_DURATIONS as readonly number[]).includes(value), "Elige una duración.");

const format = z.enum(MEETING_FORMATS, { error: "Elige cómo os veis." });

export function meetingRequestSchema(now: Date) {
  return z
    .object({
      slots: slotsSchema(now),
      duration,
      format,
      location: place,
      timeZone,
      name,
      email: contactValue("email", MEETING_LIMITS.email).pipe(z.string({ error: "Necesitamos tu email para enviarte la invitación." })),
      phone: contactValue("phone", MEETING_LIMITS.phone),
      company,
      topic: line(MEETING_LIMITS.topic).refine(isSafeText, "Sin enlaces ni teléfonos, por favor."),
      consent: z.literal(true, { error: "Marca la casilla para poder enviar la propuesta." }),
    })
    .superRefine((value, ctx) => {
      if (value.format === "phone" && !value.phone) {
        ctx.addIssue({ code: "custom", path: ["phone"], message: "Para una llamada, deja tu teléfono." });
      }
    })
    .transform((value) => ({
      ...value,
      // A place only makes sense in person; video links come from the owner.
      location: value.format === "in_person" ? value.location : "",
    }));
}

export type ValidMeetingRequest = z.output<ReturnType<typeof meetingRequestSchema>>;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

function parseWith<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  return result.success ? { ok: true, data: result.data } : { ok: false, errors: toFieldErrors(result.error) };
}

export function parseMeetingRequest(input: unknown, now: Date = new Date()): ParseResult<ValidMeetingRequest> {
  return parseWith(meetingRequestSchema(now), input);
}

// --- Answers -----------------------------------------------------------------

const note = paragraph(MEETING_LIMITS.note).refine(noLinks, "Sin enlaces, por favor. Si necesitáis compartir uno, hacedlo respondiendo al email de confirmación.");

/** Video services whose links can go into an invitation (no lookalike phishing pages). */
const VIDEO_HOSTS = ["meet.google.com", "zoom.us", "teams.microsoft.com", "teams.live.com", "whereby.com", "meet.jit.si", "webex.com"];

export function isVideoHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return VIDEO_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** A video link the confirming side may add: plain http(s), stored canonical. */
const videoLink = z
  .string()
  .max(MEETING_LIMITS.videoLink * 2)
  .transform((raw, ctx) => {
    const value = raw.trim();
    if (!value) return "";
    const url = parseHttpUrl(value);
    if (!url || url.href.length > MEETING_LIMITS.videoLink) {
      ctx.addIssue({ code: "custom", message: "Pega un enlace válido (https://…)." });
      return z.NEVER;
    }
    if (!isVideoHost(url.hostname)) {
      ctx.addIssue({ code: "custom", message: "Usa un enlace de Meet, Zoom, Teams, Whereby, Jitsi o Webex." });
      return z.NEVER;
    }
    // They all serve https: never send an invitation with a plain-text link.
    url.protocol = "https:";
    return url.href;
  });

export function confirmSchema(format: MeetingFormat) {
  return z.object({
    slot: z.string().max(40),
    location:
      format === "video"
        ? videoLink
        : format === "in_person"
          ? place
          : z.string().optional().transform(() => ""),
  });
}

export function counterSchema(now: Date) {
  return z.object({ slots: slotsSchema(now), note });
}

export const closeSchema = z.object({ note });

export function parseConfirm(input: unknown, format: MeetingFormat) {
  return parseWith(confirmSchema(format), input);
}

export function parseCounter(input: unknown, now: Date = new Date()) {
  return parseWith(counterSchema(now), input);
}

export function parseClose(input: unknown) {
  return parseWith(closeSchema, input);
}
