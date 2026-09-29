import "server-only";
import { createHash, createHmac } from "node:crypto";
import { getSigningSecret } from "@/lib/config.server";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Lockout for one-time login codes, in two layers:
 *  - per email *and* client (IP): a few attempts, enough for typos;
 *  - per email across all clients: a higher ceiling, so nobody can lock
 *    someone else out of the code login with a handful of wrong guesses,
 *    while guessing an 8-digit code that lives 10 minutes stays hopeless.
 *
 * Every attempt is stored in Supabase *before* the code is checked — so
 * parallel guesses can't all slip past a "not locked yet" read — and a
 * successful login clears them. Mirrored in memory as a fallback when the
 * secret key is missing.
 *
 * This guards our own form. Supabase's /auth/v1/verify endpoint is public too:
 * docs/SETUP.md › Supabase sets a longer code, a short expiry and its rate
 * limits so that path is covered as well.
 */

/** Attempts per email from one client (IP) in the window. */
export const OTP_MAX_ATTEMPTS = 5;
/** Attempts per email from all clients together in the window. */
export const OTP_MAX_ATTEMPTS_PER_EMAIL = 30;
export const OTP_LOCK_WINDOW_MS = 15 * 60_000;
const CLEANUP_OLDER_THAN_MS = 24 * 60 * 60_000;

const MAX_MEMORY_KEYS = 10_000;
const memoryAttempts = new Map<string, number[]>();

function keyedHash(input: string, plain: string): string {
  const secret = getSigningSecret();
  return secret ? createHmac("sha256", secret).update(input).digest("hex") : createHash("sha256").update(plain).digest("hex");
}

/**
 * Keyed hash of the email (HMAC with PASSME_SIGNING_SECRET when configured),
 * so the table can't be used to check whether an address has tried to log in.
 */
export function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return keyedHash(`otp:${normalized}`, normalized);
}

/** Same, for one email from one client. */
function hashEmailForClient(email: string, client: string): string {
  const normalized = email.trim().toLowerCase();
  return keyedHash(`otp:${normalized}:${client}`, `${normalized}\u0000${client}`);
}

function recentMemoryAttempts(hash: string, now: number): number[] {
  return (memoryAttempts.get(hash) ?? []).filter((t) => now - t < OTP_LOCK_WINDOW_MS);
}

function registerInMemory(hash: string, limit: number, now: number): boolean {
  if (memoryAttempts.size > MAX_MEMORY_KEYS) {
    for (const key of memoryAttempts.keys()) {
      if (recentMemoryAttempts(key, now).length === 0) memoryAttempts.delete(key);
    }
  }
  const attempts = [...recentMemoryAttempts(hash, now), now];
  memoryAttempts.set(hash, attempts);
  return attempts.length <= limit;
}

/**
 * Records a code attempt and says whether it may be checked. Returns false once
 * the email has used up its attempts from this client, or from everywhere, in
 * the window. Fails closed on DB errors.
 */
export async function registerOtpAttempt(email: string, client: string, now: number = Date.now()): Promise<boolean> {
  const layers = [
    { hash: hashEmailForClient(email, client), limit: OTP_MAX_ATTEMPTS },
    { hash: hashEmail(email), limit: OTP_MAX_ATTEMPTS_PER_EMAIL },
  ];
  // Both layers always record the attempt (no short-circuit), like the database does.
  const allowedInMemory = layers.map((layer) => registerInMemory(layer.hash, layer.limit, now)).every(Boolean);

  const admin = createAdminSupabase();
  if (!admin) return allowedInMemory;
  if (!allowedInMemory) return false;

  const inserted = await admin.from("auth_otp_attempts").insert(layers.map((layer) => ({ email_hash: layer.hash })));
  if (inserted.error) {
    log.warn("otp attempt insert failed", {}, inserted.error);
    return false;
  }

  const since = new Date(now - OTP_LOCK_WINDOW_MS).toISOString();
  const counts = await Promise.all(
    layers.map((layer) =>
      admin
        .from("auth_otp_attempts")
        .select("id", { count: "exact", head: true })
        .eq("email_hash", layer.hash)
        .gte("created_at", since),
    ),
  );
  const failed = counts.find((result) => result.error);
  if (failed) {
    log.warn("otp attempt count failed", {}, failed.error);
    return false;
  }

  // Opportunistic cleanup keeps the table tiny even without the daily cron.
  if (Math.random() < 0.05) {
    const cutoff = new Date(now - CLEANUP_OLDER_THAN_MS).toISOString();
    await admin.from("auth_otp_attempts").delete().lt("created_at", cutoff);
  }

  return counts.every((result, i) => (result.count ?? 0) <= layers[i]!.limit);
}

/** After a successful login the email starts from zero again (from this client and overall). */
export async function clearOtpFailures(email: string, client: string): Promise<void> {
  const hashes = [hashEmailForClient(email, client), hashEmail(email)];
  for (const hash of hashes) memoryAttempts.delete(hash);
  const admin = createAdminSupabase();
  if (!admin) return;
  const { error } = await admin.from("auth_otp_attempts").delete().in("email_hash", hashes);
  if (error) log.warn("otp attempts cleanup failed", {}, error);
}
