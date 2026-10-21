import type { ProfileEventKind } from "@/lib/supabase/database.types";

/**
 * Raw rows for the private CRM (/crm), as the data layer
 * (src/lib/data/admin-stats.ts) or the demo sample (./demo.ts) supply them.
 * Everything the pages show is computed from these, in pure functions.
 */

export interface RawUser {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  /** How they first signed in: "email" (code or link), "google"… Null when unknown. */
  provider: string | null;
}

/** A card's link. Hidden ones never carry their value or title, not even here. */
export interface RawLink {
  id: string;
  kind: string;
  visible: boolean;
  label: string;
  value: string;
}

export interface RawProfile {
  id: string;
  slug: string;
  fullName: string;
  isPublished: boolean;
  pattern: string;
  createdAt: string;
  updatedAt: string;
  headline: string;
  company: string;
  location: string;
  hasAvatar: boolean;
  hasBio: boolean;
  accentColor: string;
  typeface: string;
  links: RawLink[];
  acceptsContactRequests: boolean;
  acceptsMeetingRequests: boolean;
}

/** One card on one Apple device, and since when. Never the push token. */
export interface RawRegistration {
  serial: string;
  device: string;
  createdAt: string;
}

export interface RawEvent {
  profileId: string;
  kind: ProfileEventKind;
  source: string;
  createdAt: string;
  linkId: string | null;
  /** "ios" | "android" | "other"; null before migration 20261021120000. */
  platform: string | null;
  country: string | null;
}

/** Counts only: the people who leave their details aren't PassMe users. */
export interface RawContactRequest {
  profileId: string;
  source: string;
  createdAt: string;
}

/** Counts only, like contact requests: nothing about the guest. */
export interface RawMeeting {
  profileId: string;
  status: string;
  format: string;
  createdAt: string;
}

/** Whose card led to this one (null: on their own, or the referrer is gone). */
export interface RawReferral {
  profileId: string;
  referrerId: string | null;
  via: string;
  createdAt: string;
}

export interface AdminRawData {
  demo: boolean;
  users: RawUser[];
  profiles: RawProfile[];
  registrations: RawRegistration[];
  /** Only the selected period (and, on a user's page, only theirs). */
  events: RawEvent[];
  contactRequests: RawContactRequest[];
  meetings: RawMeeting[];
  referrals: RawReferral[];
  /** Migration 20261021120000 isn't applied: no device, country or referral is being recorded yet. */
  insightsPending: boolean;
  /** What couldn't be loaded or was cut short, for a notice on the page. */
  warnings: string[];
  /** Some part couldn't be loaded at all (not merely cut short): an export would be missing rows. */
  failed: boolean;
}
