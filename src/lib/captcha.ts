import "server-only";
import { log } from "@/lib/log";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5_000;

/** Server-side check is active only when TURNSTILE_SECRET_KEY is set. */
export function isCaptchaEnforced(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Verifies a Turnstile token. Without a secret key it always passes (the form
 * is then protected by rate limits only). Network errors fail closed.
 */
export async function verifyCaptcha(token: string | null | undefined, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token || token.length > 2048) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch (error) {
    log.warn("captcha verification error", {}, error);
    return false;
  }
}
