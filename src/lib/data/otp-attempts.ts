import "server-only";
import { createHash } from "node:crypto";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Per-email lockout for one-time login codes.
 *
 * A 6-digit code has 10⁶ combinations and stays valid for a while, so an
 * IP-only limiter is not enough (attackers rotate IPs and Vercel runs many
 * instances). Failures are stored in Supabase (shared across instances) and
 * mirrored in memory as a fallback when the secret key is missing.
 */

export const OTP_MAX_FAILURES = 5;
export const OTP_LOCK_WINDOW_MS = 15 * 60_000;
const CLEANUP_OLDER_THAN_MS = 24 * 60 * 60_000;

const MAX_MEMORY_KEYS = 10_000;
const memoryFailures = new Map<string, number[]>();

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function recentMemoryFailures(hash: string, now: number): number[] {
  return (memoryFailures.get(hash) ?? []).filter((t) => now - t < OTP_LOCK_WINDOW_MS);
}

/** True when this email has too many recent failed codes (fails closed on DB errors). */
export async function isOtpLocked(email: string, now: number = Date.now()): Promise<boolean> {
  const hash = hashEmail(email);
  if (recentMemoryFailures(hash, now).length >= OTP_MAX_FAILURES) return true;

  const admin = createAdminSupabase();
  if (!admin) return false;

  const since = new Date(now - OTP_LOCK_WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from("auth_otp_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email_hash", hash)
    .gte("created_at", since);
  if (error) {
    log.warn("otp lock check failed", {}, error);
    return true;
  }
  return (count ?? 0) >= OTP_MAX_FAILURES;
}

export async function recordOtpFailure(email: string, now: number = Date.now()): Promise<void> {
  const hash = hashEmail(email);
  if (memoryFailures.size > MAX_MEMORY_KEYS) {
    for (const key of memoryFailures.keys()) {
      if (recentMemoryFailures(key, now).length === 0) memoryFailures.delete(key);
    }
  }
  memoryFailures.set(hash, [...recentMemoryFailures(hash, now), now]);

  const admin = createAdminSupabase();
  if (!admin) return;
  const { error } = await admin.from("auth_otp_attempts").insert({ email_hash: hash });
  if (error) log.warn("otp failure insert failed", {}, error);

  // Opportunistic cleanup keeps the table tiny without a cron job.
  if (Math.random() < 0.05) {
    const cutoff = new Date(now - CLEANUP_OLDER_THAN_MS).toISOString();
    await admin.from("auth_otp_attempts").delete().lt("created_at", cutoff);
  }
}

export async function clearOtpFailures(email: string): Promise<void> {
  const hash = hashEmail(email);
  memoryFailures.delete(hash);
  const admin = createAdminSupabase();
  if (!admin) return;
  const { error } = await admin.from("auth_otp_attempts").delete().eq("email_hash", hash);
  if (error) log.warn("otp failure cleanup failed", {}, error);
}
