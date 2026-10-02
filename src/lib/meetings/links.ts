import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSigningSecret } from "@/lib/config.server";
import { getSiteUrl } from "@/lib/env";
import type { MeetingParty } from "./state";

/**
 * Signed links to a meeting, one per side: /reunion/<id>/<signature>. The
 * signature (HMAC of the id and the side, with PASSME_SIGNING_SECRET) is what
 * lets the owner answer from the email on any device without signing in, and
 * the guest manage what they proposed. Nothing is stored: the dashboard can
 * rebuild the owner's link at any time. Rotating the secret voids them all.
 */

const SIGNATURE_LENGTH = 32; // base64url characters: 192 bits
const SIGNATURE_RE = /^[A-Za-z0-9_-]{32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(secret: string, id: string, party: MeetingParty): string {
  return createHmac("sha256", secret).update(`meeting:${id.toLowerCase()}:${party}`).digest("base64url").slice(0, SIGNATURE_LENGTH);
}

/** Null without a signing secret (the meeting feature is off then). */
export function meetingSignature(id: string, party: MeetingParty): string | null {
  const secret = getSigningSecret();
  return secret ? sign(secret, id, party) : null;
}

/** Which side a link belongs to, or null if it isn't a valid link. */
export function verifyMeetingSignature(id: string, signature: string): MeetingParty | null {
  const secret = getSigningSecret();
  if (!secret || !UUID_RE.test(id) || !SIGNATURE_RE.test(signature)) return null;
  const given = Buffer.from(signature);
  for (const party of ["owner", "guest"] as const) {
    const expected = Buffer.from(sign(secret, id, party));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return party;
  }
  return null;
}

export function meetingPath(id: string, party: MeetingParty): string | null {
  const signature = meetingSignature(id, party);
  return signature ? `/reunion/${id}/${signature}` : null;
}

export function meetingUrl(id: string, party: MeetingParty): string | null {
  const path = meetingPath(id, party);
  return path ? `${getSiteUrl()}${path}` : null;
}
