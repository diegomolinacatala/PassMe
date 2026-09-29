import type { EmailOtpType } from "@supabase/supabase-js";

/** Link types our email templates may send to /auth/confirm (see supabase/templates). */
export const EMAIL_LINK_TYPES: ReadonlySet<string> = new Set([
  "email",
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
]);

export function isEmailLinkType(value: unknown): value is EmailOtpType {
  return typeof value === "string" && EMAIL_LINK_TYPES.has(value);
}

/** Token hashes are hex strings; anything else can't be one (and never reaches Supabase). */
export function isTokenHash(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,256}$/.test(value);
}
