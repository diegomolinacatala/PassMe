/**
 * "Agendar reunión" constants, kept free of zod so client components (the
 * visitor's form, the picker, the editor's settings) can import them without
 * pulling the validation library into the browser bundle. The schemas that
 * enforce them live in ./schema, which re-exports everything here.
 * Keep the limits in sync with supabase/migrations/20261002120000_meeting_requests.sql.
 */

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
