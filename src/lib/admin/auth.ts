import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSigningSecret } from "@/lib/config.server";

/**
 * The private stats dashboard (/admin) has its own username and password, set
 * as server env vars (never in the repo). Without them /admin is a 404.
 *
 * The session is a stateless signed cookie: `v1.<expiry>.<hmac>`. The HMAC key
 * is derived from the credentials, so changing ADMIN_PASSWORD signs everyone out.
 */

export const ADMIN_COOKIE = "passme_admin";
export const ADMIN_SESSION_SECONDS = 3 * 24 * 60 * 60;
export const MIN_ADMIN_PASSWORD_LENGTH = 16;

const TOKEN_VERSION = "v1";

/**
 * Without PASSME_SIGNING_SECRET (local runs), a random key per process: a public
 * constant would let anyone holding a cookie brute-force the password offline.
 */
const FALLBACK_KEY = randomBytes(32);

export interface AdminCredentials {
  username: string;
  password: string;
}

type Env = Record<string, string | undefined>;

/** Null when the dashboard is off: no username, or a password shorter than 16 characters. */
export function getAdminCredentials(env: Env = process.env): AdminCredentials | null {
  const username = env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!username || !password || password.length < MIN_ADMIN_PASSWORD_LENGTH) return null;
  return { username, password };
}

/** Fixed-length digests, so comparing them takes the same time whatever was typed. */
function digest(value: string): Buffer {
  return createHmac("sha256", "passme-admin-compare").update(value).digest();
}

/** Constant-time check of what the login form sent. The username ignores case and spaces around it. */
export function credentialsMatch(credentials: AdminCredentials, username: string, password: string): boolean {
  const userOk = timingSafeEqual(digest(username.trim().toLowerCase()), digest(credentials.username));
  const passwordOk = timingSafeEqual(digest(password), digest(credentials.password));
  return userOk && passwordOk;
}

function sign(credentials: AdminCredentials, payload: string): string {
  const key = createHmac("sha256", getSigningSecret() ?? FALLBACK_KEY)
    .update(`admin-session\n${credentials.username}\n${credentials.password}`)
    .digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createAdminToken(credentials: AdminCredentials, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + ADMIN_SESSION_SECONDS;
  const payload = `${TOKEN_VERSION}.${expires}`;
  return `${payload}.${sign(credentials, payload)}`;
}

export function isValidAdminToken(
  token: string | undefined,
  credentials: AdminCredentials,
  now = Date.now(),
): boolean {
  if (!token || token.length > 200) return false;
  const [version, expires, signature, ...rest] = token.split(".");
  if (rest.length > 0 || version !== TOKEN_VERSION || !expires || !signature || !/^\d{1,12}$/.test(expires)) {
    return false;
  }
  if (Number(expires) * 1000 <= now) return false;

  const expected = Buffer.from(sign(credentials, `${version}.${expires}`));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
