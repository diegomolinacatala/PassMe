/**
 * Telling a wrong code from a broken check. `verifyOtp` fails for two very
 * different reasons, and the person must hear the right one:
 *  - the code is wrong or expired (Supabase answers 400, 403 or 422, with the
 *    `otp_expired` code for a stale one): they type another;
 *  - Supabase could not judge it at all (rate limit, outage, network): their
 *    digits were fine, so keep them, don't count the attempt and say it's on us.
 */

/** What supabase-js errors expose. `AuthRetryableFetchError` is its name for network and 5xx failures. */
export interface AuthErrorLike {
  name?: string;
  status?: number;
  code?: string;
  message?: string;
}

/** True when the error says nothing about the code itself: 429, 5xx, no answer, or a network failure. */
export function isTransientAuthError(error: AuthErrorLike): boolean {
  if (error.code === "otp_expired") return false;
  if (error.name === "AuthRetryableFetchError") return true;
  const { status } = error;
  return typeof status === "number" && (status === 429 || status === 0 || status >= 500);
}
