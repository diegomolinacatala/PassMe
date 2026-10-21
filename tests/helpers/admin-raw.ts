import type {
  AdminRawData,
  RawContactRequest,
  RawEvent,
  RawMeeting,
  RawProfile,
  RawReferral,
  RawRegistration,
  RawUser,
} from "@/lib/admin/types";

/** Builders for the CRM's raw rows: only what a test cares about, sensible defaults for the rest. */

export const NOW = new Date("2026-10-06T10:00:00Z");

/** An instant `daysAgo` days before NOW, at `hour` UTC. */
export function iso(daysAgo: number, hour = 10): string {
  return new Date(NOW.getTime() - daysAgo * 86_400_000 + (hour - 10) * 3_600_000).toISOString();
}

export const A = "00000000-0000-4000-8000-00000000000a";
export const B = "00000000-0000-4000-8000-00000000000b";
export const C = "00000000-0000-4000-8000-00000000000c";

export function user(id: string, fields: Partial<RawUser> = {}): RawUser {
  return { id, email: `${id.slice(-1)}@example.com`, createdAt: iso(10), lastSignInAt: null, provider: "email", ...fields };
}

export function profile(id: string, fields: Partial<RawProfile> = {}): RawProfile {
  return {
    id,
    slug: `card-${id.slice(-1)}`,
    fullName: `Card ${id.slice(-1).toUpperCase()}`,
    isPublished: true,
    pattern: "arco",
    createdAt: iso(10),
    updatedAt: iso(10),
    headline: "",
    company: "",
    location: "",
    hasAvatar: false,
    hasBio: false,
    accentColor: "#EF7A4A",
    typeface: "clasica",
    links: [],
    acceptsContactRequests: true,
    acceptsMeetingRequests: false,
    ...fields,
  };
}

export function registration(serial: string, device: string, fields: Partial<RawRegistration> = {}): RawRegistration {
  return { serial, device, createdAt: iso(5), ...fields };
}

export function event(profileId: string, kind: RawEvent["kind"], fields: Partial<RawEvent> = {}): RawEvent {
  return { profileId, kind, source: "direct", createdAt: iso(0), linkId: null, platform: null, country: null, ...fields };
}

export function contactRequest(profileId: string, fields: Partial<RawContactRequest> = {}): RawContactRequest {
  return { profileId, source: "qr", createdAt: iso(1), ...fields };
}

export function meeting(profileId: string, fields: Partial<RawMeeting> = {}): RawMeeting {
  return { profileId, status: "pending", format: "video", createdAt: iso(1), ...fields };
}

export function referral(profileId: string, referrerId: string | null, fields: Partial<RawReferral> = {}): RawReferral {
  return { profileId, referrerId, via: referrerId ? "qr" : "direct", createdAt: iso(3), ...fields };
}

export function rawData(fields: Partial<AdminRawData> = {}): AdminRawData {
  return {
    demo: false,
    users: [],
    profiles: [],
    registrations: [],
    events: [],
    contactRequests: [],
    meetings: [],
    referrals: [],
    insightsPending: false,
    warnings: [],
    failed: false,
    ...fields,
  };
}
