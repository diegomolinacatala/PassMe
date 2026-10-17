import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * The only link type our email template sends to /auth/confirm
 * (supabase/templates/magic-link.html: `type=email`, used for both the Magic
 * Link and Confirm signup emails). Recovery, invite and email-change tokens
 * are not ours to sign anyone in with.
 */
export const EMAIL_LINK_TYPES: ReadonlySet<string> = new Set(["email"]);

export function isEmailLinkType(value: unknown): value is EmailOtpType {
  return typeof value === "string" && EMAIL_LINK_TYPES.has(value);
}

/** Token hashes are hex strings; anything else can't be one (and never reaches Supabase). */
export function isTokenHash(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,256}$/.test(value);
}
