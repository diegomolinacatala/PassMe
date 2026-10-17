/**
 * Which sessions the app accepts. PassMe signs people in with an emailed code
 * (`otp`, `magiclink`) or Google (`oauth`) only; it never offers passwords or
 * anonymous logins. Supabase's public Auth API does, though, and the project
 * key is public: a session born that way (say, an attacker who signed up with a
 * victim's email and a password of their own) did not go through our code
 * screen, so it is not a session of ours.
 *
 * Pure and dependency-free: the proxy (edge of every request) and
 * `getSessionUser` share it.
 */

/** Authentication methods (JWT `amr`) that never belong to a PassMe session. */
const REJECTED_METHODS: ReadonlySet<string> = new Set(["password", "anonymous"]);

/** The claims this check reads; `getClaims()` returns many more. */
export interface SessionClaims {
  sub?: unknown;
  is_anonymous?: unknown;
  amr?: unknown;
}

/**
 * Method names from the `amr` claim. It comes in two shapes: RFC 8176 strings
 * (`["otp"]`) or Supabase's detailed entries (`[{ method: "otp", timestamp }]`).
 */
export function authMethods(amr: unknown): string[] {
  if (!Array.isArray(amr)) return [];
  const methods: string[] = [];
  for (const entry of amr) {
    if (typeof entry === "string") methods.push(entry);
    else if (typeof entry === "object" && entry !== null && typeof (entry as { method?: unknown }).method === "string") {
      methods.push((entry as { method: string }).method);
    }
  }
  return methods;
}

/** True when the verified claims describe a session the app should honour. */
export function isAppSession(claims: SessionClaims | null | undefined): boolean {
  if (!claims || typeof claims.sub !== "string" || !claims.sub) return false;
  if (claims.is_anonymous === true) return false;
  return !authMethods(claims.amr).some((method) => REJECTED_METHODS.has(method));
}

/** Supabase answers this when there is simply nobody signed in: expected, never worth a log line. */
export function isSessionMissingError(error: { name?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && (error.name === "AuthSessionMissingError" || /auth session missing/i.test(error.message ?? "")));
}
