import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { getSigningSecret } from "@/lib/config.server";

/**
 * Short-lived signed links so the owner can open "add to wallet" on their
 * phone (scan a QR on the desktop dashboard) without logging in there.
 * The token only allows downloading the owner's own pass — nothing else.
 */

const PURPOSE = "wallet-handoff";
const AUDIENCE = "passme:wallet";
export const HANDOFF_TTL_SECONDS = 30 * 60;

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signHandoffToken(profileId: string, now: Date = new Date()): Promise<string | null> {
  const secret = getSigningSecret();
  if (!secret) return null;
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(profileId)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + HANDOFF_TTL_SECONDS)
    .sign(key(secret));
}

export async function verifyHandoffToken(token: string | null | undefined): Promise<string | null> {
  const secret = getSigningSecret();
  if (!secret || !token || token.length > 1024) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { audience: AUDIENCE, algorithms: ["HS256"] });
    return payload.purpose === PURPOSE && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
