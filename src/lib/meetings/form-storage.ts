import { DEFAULT_DURATION, MEETING_DURATIONS, MEETING_FORMATS, MAX_SLOTS, type MeetingDuration, type MeetingFormat } from "./schema";

/**
 * "Agendar reunión" half-filled, kept for this tab only (sessionStorage): a
 * reload or the browser's back button must not lose the chosen times or what
 * was typed. Dropped once sent. The consent box is never restored: ticking it
 * stays a deliberate act. Every access is guarded (storage can be blocked).
 */

const KEY_PREFIX = "passme:meeting:";
export const MEETING_FORM_TTL_MS = 30 * 60_000;

export interface MeetingFormWhen {
  slots: string[];
  duration: MeetingDuration;
  format: MeetingFormat;
  /** The place (in person). */
  location: string;
  /** The video link the visitor already has (video). */
  link: string;
}

export interface MeetingFormWho {
  name: string;
  email: string;
  phone: string;
  company: string;
  topic: string;
}

export interface StoredMeetingForm {
  step: 1 | 2;
  when: MeetingFormWhen;
  who: MeetingFormWho;
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

function session(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** What was left for `slug`, with times already past dropped; null when nothing (or stale). */
export function readMeetingForm(slug: string, now: number = Date.now()): StoredMeetingForm | null {
  const store = session();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { step?: unknown; when?: Partial<Record<keyof MeetingFormWhen, unknown>>; who?: Partial<Record<keyof MeetingFormWho, unknown>>; savedAt?: unknown };
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (now - savedAt > MEETING_FORM_TTL_MS || now < savedAt) {
      store.removeItem(KEY_PREFIX + slug);
      return null;
    }
    const when = parsed.when ?? {};
    const slots = (Array.isArray(when.slots) ? when.slots : [])
      .filter((slot): slot is string => typeof slot === "string" && slot.length <= 40 && Date.parse(slot) > now)
      .slice(0, MAX_SLOTS);
    const duration = (MEETING_DURATIONS as readonly unknown[]).includes(when.duration) ? (when.duration as MeetingDuration) : DEFAULT_DURATION;
    const format = (MEETING_FORMATS as readonly unknown[]).includes(when.format) ? (when.format as MeetingFormat) : "in_person";
    const who = parsed.who ?? {};
    return {
      // Step 2 only makes sense with times still ahead.
      step: parsed.step === 2 && slots.length > 0 ? 2 : 1,
      when: { slots, duration, format, location: text(when.location, 200), link: text(when.link, 400) },
      who: { name: text(who.name, 200), email: text(who.email, 300), phone: text(who.phone, 60), company: text(who.company, 200), topic: text(who.topic, 300) },
    };
  } catch {
    return null;
  }
}

export function writeMeetingForm(slug: string, value: StoredMeetingForm, now: number = Date.now()): void {
  try {
    session()?.setItem(KEY_PREFIX + slug, JSON.stringify({ ...value, savedAt: now }));
  } catch {
    // Full or blocked storage: the form still works, it just won't survive a reload.
  }
}

export function clearMeetingForm(slug: string): void {
  try {
    session()?.removeItem(KEY_PREFIX + slug);
  } catch {
    // Nothing to do.
  }
}
