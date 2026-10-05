/**
 * Cheap "is someone signed in on this browser?" check: Supabase keeps the
 * session in `sb-<project>-auth-token` (split into `.0`, `.1`… when large).
 * Only a hint for choosing what to show (e.g. "Mi tarjeta" instead of
 * "Entrar"): it costs no network call, and anything that needs the user
 * verifies the session for real.
 */
const AUTH_COOKIE_RE = /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i;

export function hasSupabaseAuthCookie(names: Iterable<string>): boolean {
  for (const name of names) {
    if (AUTH_COOKIE_RE.test(name)) return true;
  }
  return false;
}
