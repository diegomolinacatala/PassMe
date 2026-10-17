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

/** Set once the missing secret key has been reported, so production logs it a single time. */
let reportedMissingAdmin = false;

/**
 * What registering an attempt answered:
 *  - "ok": go ahead and check the code;
 *  - "locked": too many tries for this email (from here, or from everywhere);
 *  - "unavailable": the counters couldn't be stored or read, so the code was NOT checked.
 *    That is our problem, not the person's: it must not read as a lockout.
 */
export type OtpAttemptStatus = "ok" | "locked" | "unavailable";

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

/** Takes back the newest in-memory attempt for `hash`. */
function unregisterInMemory(hash: string): void {
  const attempts = memoryAttempts.get(hash);
  if (!attempts) return;
  attempts.pop();
  if (attempts.length === 0) memoryAttempts.delete(hash);
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
 * Records a code attempt and says whether it may be checked: "locked" once the
 * email has used up its attempts from this client, or from everywhere, in the
 * window. Fails closed on database errors ("unavailable": nothing was checked,
 * and the attempt is not held against the person).
 */
export async function registerOtpAttempt(
  email: string,
  client: string,
  now: number = Date.now(),
): Promise<OtpAttemptStatus> {
  const layers = [
    { hash: hashEmailForClient(email, client), limit: OTP_MAX_ATTEMPTS },
    { hash: hashEmail(email), limit: OTP_MAX_ATTEMPTS_PER_EMAIL },
  ];
  // Both layers always record the attempt (no short-circuit), like the database does.
  const allowedInMemory = layers.map((layer) => registerInMemory(layer.hash, layer.limit, now)).every(Boolean);

  const admin = createAdminSupabase();
  if (!admin) {
    if (process.env.NODE_ENV === "production" && !reportedMissingAdmin) {
      reportedMissingAdmin = true;
      log.error("code lockout is per-instance only: SUPABASE_SECRET_KEY is missing");
    }
    return allowedInMemory ? "ok" : "locked";
  }
  if (!allowedInMemory) return "locked";

  const unavailable = (what: string, error: unknown): OtpAttemptStatus => {
    log.error(what, {}, error);
    for (const layer of layers) unregisterInMemory(layer.hash);
    return "unavailable";
  };

  const inserted = await admin.from("auth_otp_attempts").insert(layers.map((layer) => ({ email_hash: layer.hash })));
  if (inserted.error) return unavailable("otp attempt insert failed", inserted.error);

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
  if (failed) return unavailable("otp attempt count failed", failed.error);

  // Opportunistic cleanup keeps the table tiny even without the daily cron.
  if (Math.random() < 0.05) {
    const cutoff = new Date(now - CLEANUP_OLDER_THAN_MS).toISOString();
    await admin.from("auth_otp_attempts").delete().lt("created_at", cutoff);
  }

  return counts.every((result, i) => (result.count ?? 0) <= layers[i]!.limit) ? "ok" : "locked";
}

/**
 * Gives back the attempt `registerOtpAttempt` just recorded, for when the code
 * was never really judged (Supabase was down or rate-limiting us): a wrong guess
 * counts, our own failure doesn't. Removes the newest row of each layer, which
 * is equivalent for counting even if a parallel attempt landed in between.
 */
export async function forgetOtpAttempt(email: string, client: string): Promise<void> {
  const hashes = [hashEmailForClient(email, client), hashEmail(email)];
  for (const hash of hashes) unregisterInMemory(hash);

  const admin = createAdminSupabase();
  if (!admin) return;
  const newest = await Promise.all(
    hashes.map((hash) =>
      admin.from("auth_otp_attempts").select("id").eq("email_hash", hash).order("id", { ascending: false }).limit(1),
    ),
  );
  const failed = newest.find((result) => result.error);
  if (failed) {
    log.warn("otp attempt refund failed", {}, failed.error);
    return;
  }
  const ids = newest.flatMap((result) => (result.data ?? []).map((row) => row.id));
  if (ids.length === 0) return;
  const { error } = await admin.from("auth_otp_attempts").delete().in("id", ids);
  if (error) log.warn("otp attempt refund failed", {}, error);
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
