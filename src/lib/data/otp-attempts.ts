import "server-only";
import { createHash, createHmac } from "node:crypto";
import { getSigningSecret } from "@/lib/config.server";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Per-email lockout for one-time login codes.
 *
 * A one-time code (8 digits in production) stays valid for minutes, so an
 * IP-only limiter is not enough (attackers rotate IPs and Vercel runs many
 * instances). Every attempt is stored in Supabase *before* the code is checked
 * — so parallel guesses can't all slip past a "not locked yet" read — and a
 * successful login clears them. Mirrored in memory as a fallback when the
 * secret key is missing.
 *
 * This guards our own form. Supabase's /auth/v1/verify endpoint is public too:
 * docs/SETUP.md › Supabase sets a longer code, a short expiry and its rate
 * limits so that path is covered as well.
 */

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCK_WINDOW_MS = 15 * 60_000;
const CLEANUP_OLDER_THAN_MS = 24 * 60 * 60_000;

const MAX_MEMORY_KEYS = 10_000;
const memoryAttempts = new Map<string, number[]>();

/**
 * Keyed hash of the email (HMAC with PASSME_SIGNING_SECRET when configured),
 * so the table can't be used to check whether an address has tried to log in.
 */
export function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const secret = getSigningSecret();
  return secret
    ? createHmac("sha256", secret).update(`otp:${normalized}`).digest("hex")
    : createHash("sha256").update(normalized).digest("hex");
}

function recentMemoryAttempts(hash: string, now: number): number[] {
  return (memoryAttempts.get(hash) ?? []).filter((t) => now - t < OTP_LOCK_WINDOW_MS);
}

function registerInMemory(hash: string, now: number): boolean {
  if (memoryAttempts.size > MAX_MEMORY_KEYS) {
    for (const key of memoryAttempts.keys()) {
      if (recentMemoryAttempts(key, now).length === 0) memoryAttempts.delete(key);
    }
  }
  const attempts = [...recentMemoryAttempts(hash, now), now];
  memoryAttempts.set(hash, attempts);
  return attempts.length <= OTP_MAX_ATTEMPTS;
}

/**
 * Records a code attempt and says whether it may be checked. Returns false once
 * an email has used up its attempts in the window. Fails closed on DB errors.
 */
export async function registerOtpAttempt(email: string, now: number = Date.now()): Promise<boolean> {
  const hash = hashEmail(email);
  const allowedInMemory = registerInMemory(hash, now);

  const admin = createAdminSupabase();
  if (!admin) return allowedInMemory;
  if (!allowedInMemory) return false;

  const inserted = await admin.from("auth_otp_attempts").insert({ email_hash: hash });
  if (inserted.error) {
    log.warn("otp attempt insert failed", {}, inserted.error);
    return false;
  }

  const since = new Date(now - OTP_LOCK_WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from("auth_otp_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email_hash", hash)
    .gte("created_at", since);
  if (error) {
    log.warn("otp attempt count failed", {}, error);
    return false;
  }

  // Opportunistic cleanup keeps the table tiny even without the daily cron.
  if (Math.random() < 0.05) {
    const cutoff = new Date(now - CLEANUP_OLDER_THAN_MS).toISOString();
    await admin.from("auth_otp_attempts").delete().lt("created_at", cutoff);
  }

  return (count ?? 0) <= OTP_MAX_ATTEMPTS;
}

/** After a successful login the email starts from zero again. */
export async function clearOtpFailures(email: string): Promise<void> {
  const hash = hashEmail(email);
  memoryAttempts.delete(hash);
  const admin = createAdminSupabase();
  if (!admin) return;
  const { error } = await admin.from("auth_otp_attempts").delete().eq("email_hash", hash);
  if (error) log.warn("otp attempts cleanup failed", {}, error);
}
