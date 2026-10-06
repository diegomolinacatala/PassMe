/**
 * "Agendar reunión": what a visitor proposes and what each side answers.
 * Isomorphic — the forms and the server actions share these rules.
 * Keep the limits in sync with supabase/migrations/20261002120000_meeting_requests.sql.
 */
import { z } from "zod";
import { normalizeLinkValue, parseHttpUrl } from "@/lib/card/links";
import { line, paragraph, toFieldErrors, type FieldErrors } from "@/lib/card/text";
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
/**
 * Generic TLDs that spam uses, plus every country code. "Expo.Pack", "S.L." or
 * "EE.UU." are plain text; "evil.com" or "bit.ly" are links an email client
 * would make clickable.
 */
const GENERIC_TLDS =
  "com|net|org|info|biz|edu|gov|int|mil|app|dev|xyz|online|site|website|store|shop|club|top|link|live|tech|pro|name|mobi|art|blog|cloud|page|email|click|icu|vip|win|bid|life|world|today|news|space|fun|cat|eus|gal|madrid|barcelona|bcn";
const COUNTRY_TLDS =
  "ac|ad|ae|af|ag|ai|al|am|ao|aq|ar|as|at|au|aw|ax|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bw|by|bz|ca|cc|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cu|cv|cw|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|er|es|et|eu|fi|fj|fk|fm|fo|fr|ga|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|me|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|rs|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sk|sl|sm|sn|so|sr|ss|st|su|sv|sx|sy|sz|tc|td|tf|tg|th|tj|tk|tl|tm|tn|to|tr|tt|tv|tw|tz|ua|ug|uk|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|za|zm|zw";
/**
 * Links have no business in text a form anyone can fill sends to an inbox: a
 * scheme, "www.", an email, a domain followed by a path, or a known TLD that
 * ends the word.
 */
const LINKISH_RE = new RegExp(
  String.raw`https?:|www\.|:\/\/|@|[\p{L}\d-]\.[\p{L}\d-]+\/|[\p{L}\d-]\.(?:${GENERIC_TLDS}|${COUNTRY_TLDS})(?![\p{L}\d])`,
  "iu",
);
/** Nine or more digits, maybe split by single spaces, dots or dashes: a phone number. */
const PHONEISH_RE = /\d(?:[\s.-]?\d){8,}/;
/** Dates (27-10-2026, 27/10/2026) and times (10:30, 10h30) are not phone numbers. */
const DATE_RE = /(?<!\d)(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}(?!\d)/g;
const TIME_RE = /(?<!\d)(?:[01]?\d|2[0-3])[:h][0-5]\d(?!\d)/g;
/** Letters, marks and the punctuation real names use (O'Connor, Jean-Luc, Mª José, J. R., Marta (Aranda)). */
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .,'’()-]*$/u;
const FRAGMENT_MAX = 40;

const noLinks = (s: string) => !LINKISH_RE.test(s);

/** The whole word around a match, without trailing punctuation, to quote it back. */
function wordAt(s: string, start: number, end: number): string {
  const from = s.slice(0, start).search(/\S*$/);
  const tail = s.slice(end).match(/^\S*/)?.[0] ?? "";
  const word = (s.slice(from, end) + tail).replace(/[.,;:!?)»”"']+$/u, "");
  return word.length > FRAGMENT_MAX ? `${word.slice(0, FRAGMENT_MAX - 1)}…` : word;
}

/**
 * Why a free text can't reach someone's inbox (a link, an email or a phone
 * number), quoting the fragment so the visitor knows what to change; null when
 * it's fine.
 */
export function unsafeTextReason(s: string): string | null {
  const link = LINKISH_RE.exec(s);
  if (link) {
    const fragment = wordAt(s, link.index, link.index + link[0].length);
    return fragment.includes("@")
      ? `“${fragment}” parece un email. Si es el tuyo, ponlo en su campo.`
      : `“${fragment}” parece un enlace. Escríbelo sin el punto.`;
  }
  // Blank dates and times out (same length, so indexes still match the text).
  const digitsOnly = s.replace(DATE_RE, (m) => " ".repeat(m.length)).replace(TIME_RE, (m) => " ".repeat(m.length));
  const phone = PHONEISH_RE.exec(digitsOnly);
  if (phone) return `“${phone[0].trim()}” parece un teléfono: ponlo en su campo.`;
  return null;
}

/** Free text that may reach someone's inbox: no links, emails, domains or phone numbers. */
export function isSafeText(s: string): boolean {
  return unsafeTextReason(s) === null;
}

export function isSafeName(s: string): boolean {
  return NAME_RE.test(s) && isSafeText(s);
}

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
