/**
 * "Agendar reunión": what a visitor proposes and what each side answers.
 * Isomorphic — the forms and the server actions share these rules.
 * Keep the limits in sync with supabase/migrations/20261002120000_meeting_requests.sql.
 *
 * This module holds the zod schemas. Client components must import the plain
 * constants from ./constants instead (they are re-exported here for the server).
 */
import { z } from "zod";
import { normalizeLinkValue, parseHttpUrl } from "@/lib/card/links";
import { line, paragraph, toFieldErrors, type FieldErrors } from "@/lib/card/text";
import {
  HORIZON_DAYS,
  MAX_SLOTS,
  MEETING_DURATIONS,
  MEETING_FORMATS,
  MEETING_LIMITS,
  type MeetingDuration,
  type MeetingFormat,
} from "./constants";
import { NAME_RE, noLinks, unsafeTextReason, isSafeText } from "./text-safety";
import { canonicalTimeZone, DEFAULT_TIME_ZONE } from "./time";

export * from "./constants";
export * from "./text-safety";

/** Times sit on quarter hours (the picker offers half hours). */
const STEP_MINUTES = 15;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Refines a text field with the quoted reason it can't be sent. */
function safeText<T extends z.ZodType<string>>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const reason = unsafeTextReason(value);
    if (reason) ctx.addIssue({ code: "custom", message: reason });
  });
}

const name = safeText(line(MEETING_LIMITS.name).pipe(z.string().min(1, "Dinos cómo te llamas."))).refine(
  (value) => !isSafeText(value) || NAME_RE.test(value),
  "Escribe solo tu nombre.",
);

const company = safeText(line(MEETING_LIMITS.company));
const place = safeText(line(MEETING_LIMITS.location));

/** Map services whose links can stand for the place ("Cómo llegar"): no lookalike pages. */
const MAP_LINKS: ReadonlyArray<{ host: string; path?: string }> = [
  { host: "maps.app.goo.gl" },
  { host: "goo.gl", path: "/maps" },
  { host: "google.com", path: "/maps" },
  { host: "maps.google.com" },
  { host: "maps.apple.com" },
];

export function isMapLink(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return MAP_LINKS.some((allowed) => host === allowed.host && (!allowed.path || url.pathname === allowed.path || url.pathname.startsWith(`${allowed.path}/`)));
}

/** The place: a few words, or a Google Maps / Apple Maps link (stored canonical, https). */
const placeOrMap = z
  .string()
  .max(MEETING_LIMITS.videoLink * 2)
  .transform((raw, ctx) => {
    const value = raw.trim();
    const url = /^https?:\/\//i.test(value) ? parseHttpUrl(value) : null;
    if (url && isMapLink(url)) {
      url.protocol = "https:";
      if (url.href.length <= MEETING_LIMITS.videoLink) return url.href;
      ctx.addIssue({ code: "custom", message: "Ese enlace es muy largo: usa el de «Compartir» de Google Maps." });
      return z.NEVER;
    }
    const parsed = place.safeParse(value);
    if (parsed.success) return parsed.data;
    ctx.addIssue({ code: "custom", message: url ? "Solo enlaces de Google Maps o Apple Maps. Si no, escribe el sitio." : (parsed.error.issues[0]?.message ?? "Revisa el sitio.") });
    return z.NEVER;
  });

/** Control and format characters: CR/LF, NUL, zero-width and bidirectional marks… */
const INVISIBLE_RE = /[\p{Cc}\p{Cf}]/u;

/** One contact value normalized like the card's own links (email or phone). */
function contactValue(kind: "email" | "phone", max: number) {
  return z
    .string()
    .max(max * 2)
    .transform((raw, ctx) => {
      const value = raw.trim();
      if (!value) return null;
      // Never part of a real address or number, and a classic way to smuggle headers or disguise a value.
      if (INVISIBLE_RE.test(value)) {
        ctx.addIssue({ code: "custom", message: kind === "email" ? "Email no válido." : "Solo números, espacios y el prefijo +." });
        return z.NEVER;
      }
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

/** A place, a map link or a video link: whichever the format turns out to need. */
const anyLocation = z
  .string()
  .max(MEETING_LIMITS.videoLink * 2)
  .transform((raw, ctx) => {
    if (placeOrMap.safeParse(raw).success || videoLink.safeParse(raw).success) return raw.trim();
    const isLink = /^https?:/i.test(raw.trim());
    const asPlace = place.safeParse(raw);
    ctx.addIssue({
      code: "custom",
      message: isLink
        ? "Ese enlace no vale: para el sitio, Google Maps o Apple Maps; para la videollamada, Meet, Zoom, Teams, Whereby, Jitsi o Webex."
        : asPlace.success
          ? "Revisa este campo."
          : (asPlace.error.issues[0]?.message ?? "Revisa este campo."),
    });
    return z.NEVER;
  });

export function meetingRequestSchema(now: Date) {
  return z
    .object({
      slots: slotsSchema(now),
      duration,
      format,
      // Checked here for anything unsafe, then read per format below.
      location: anyLocation,
      timeZone,
      name,
      email: contactValue("email", MEETING_LIMITS.email).pipe(z.string({ error: "Necesitamos tu email para enviarte la invitación." })),
      phone: contactValue("phone", MEETING_LIMITS.phone),
      company,
      topic: safeText(line(MEETING_LIMITS.topic)),
      consent: z.literal(true, { error: "Marca la casilla para poder enviar la propuesta." }),
    })
    .superRefine((value, ctx) => {
      if (value.format === "phone" && !value.phone) {
        ctx.addIssue({ code: "custom", path: ["phone"], message: "Para una llamada, deja tu teléfono." });
      }
    })
    .transform((value, ctx) => {
      // In person: a place or a map link. Video: the visitor's link if they have one (any other text is dropped).
      const isLink = /^https?:/i.test(value.location);
      const schema = value.format === "in_person" ? placeOrMap : value.format === "video" && isLink ? videoLink : null;
      if (!schema) return { ...value, location: "" };
      const parsed = schema.safeParse(value.location);
      if (parsed.success) return { ...value, location: parsed.data };
      ctx.addIssue({ code: "custom", path: ["location"], message: parsed.error.issues[0]?.message ?? "Revisa este campo." });
      return z.NEVER;
    });
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

/** The same allowlisted video link, for the owner's default (meeting settings). */
export const videoLinkSchema = videoLink;

export function confirmSchema(format: MeetingFormat) {
  return z.object({
    slot: z.string().max(40),
    location:
      format === "video"
        ? videoLink
        : format === "in_person"
          ? placeOrMap
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
