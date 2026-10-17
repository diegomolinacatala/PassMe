import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Options shared by the three Supabase clients (proxy, server, browser) so the
 * session cookie is written the same way everywhere. `@supabase/ssr` keeps its
 * own defaults (path `/`, `SameSite=Lax`, long max-age) and adds nothing about
 * `Secure`, so production asks for it explicitly: the cookie then never travels
 * over plain http. (It stays readable by the browser client, which avatar
 * uploads use; HSTS covers the first visit.)
 */
export function supabaseCookieOptions(): CookieOptionsWithName {
  return { secure: process.env.NODE_ENV === "production" };
}
