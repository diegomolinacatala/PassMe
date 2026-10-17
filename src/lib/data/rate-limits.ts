import "server-only";
import { createHash, createHmac } from "node:crypto";
import { getSigningSecret } from "@/lib/config.server";
import { isSupabaseConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { createRateLimiter, type RateLimitResult } from "@/lib/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Rate limiter shared by every serverless instance: counters live in Postgres
 * (rate_limit_hit(), migration 20260929120000). Keys are keyed hashes (HMAC
 * with PASSME_SIGNING_SECRET), so no raw IPs are stored and an IP can't be
 * recovered from its hash by brute force. Falls back to the per-instance
 * memory limiter when the secret key is missing (demo, tests) or the database
 * call fails, so a Supabase hiccup never takes the site down. The fallback is
 * loud (an error in the log, at most once a minute) because per-instance
 * counters are a much weaker limit than the shared ones.
 *
 * Limiters guarding something an attacker would love to guess (the admin
 * login) pass `failClosed`: when the shared counter can't be reached they
 * refuse instead of falling back to memory.
 */

export interface SharedRateLimitResult extends RateLimitResult {
  /** True when the shared counter wasn't reachable and this answer isn't the shared one. */
  degraded: boolean;
}

export interface SharedRateLimiter {
  check(key: string): Promise<SharedRateLimitResult>;
}

interface Options {
  /** Namespace, e.g. "login-ip". Different limiters never share counters. */
  name: string;
  limit: number;
  windowMs: number;
  /** Refuse (instead of counting in memory) while the shared counter is unreachable. */
  failClosed?: boolean;
}

/** How long a refusal tells the caller to wait when the shared counter is down. */
const FAIL_CLOSED_RETRY_SECONDS = 60;
/** The fallback is logged at most this often, however many limiters hit it. */
const FALLBACK_LOG_INTERVAL_MS = 60_000;

let lastFallbackLogAt = 0;

/** True at most once per interval: a sick database must not flood the log. */
function shouldLogFallback(now: number): boolean {
  if (now - lastFallbackLogAt < FALLBACK_LOG_INTERVAL_MS) return false;
  lastFallbackLogAt = now;
  return true;
}

function hashKey(name: string, key: string): string {
  const secret = getSigningSecret();
  const input = `rate:${name}:${key}`;
  const hash = secret ? createHmac("sha256", secret) : createHash("sha256");
  return hash.update(input).digest("hex");
}

function parseHit(data: unknown): { allowed: boolean; retryAfter: number } | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const { allowed, retry_after } = row as { allowed?: unknown; retry_after?: unknown };
  if (typeof allowed !== "boolean") return null;
  return { allowed, retryAfter: typeof retry_after === "number" ? retry_after : Number(retry_after) || 0 };
}

type RpcError = { message?: string; code?: string } | null;

async function callRateLimitHit(
  admin: NonNullable<ReturnType<typeof createAdminSupabase>>,
  args: { p_key: string; p_limit: number; p_window_seconds: number },
): Promise<{ data: unknown; error: RpcError }> {
  try {
    return await admin.rpc("rate_limit_hit", args);
  } catch (thrown) {
    return { data: null, error: { message: thrown instanceof Error ? thrown.message : String(thrown) } };
  }
}

export function createSharedRateLimiter({ name, limit, windowMs, failClosed = false }: Options): SharedRateLimiter {
  const memory = createRateLimiter({ limit, windowMs });
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const fromMemory = (key: string): SharedRateLimitResult => ({ ...memory.check(`${name}:${key}`), degraded: false });

  return {
    async check(key) {
      const admin = createAdminSupabase();
      if (!admin) {
        // Demo and tests have no secret key on purpose. A configured production project without one is a mistake.
        if (process.env.NODE_ENV === "production" && isSupabaseConfigured() && shouldLogFallback(Date.now())) {
          log.error("rate limits are per-instance only: SUPABASE_SECRET_KEY is missing", { name });
        }
        return fromMemory(key);
      }

      const { data, error } = await callRateLimitHit(admin, {
        p_key: hashKey(name, key),
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      const hit = error ? null : parseHit(data);
      if (!hit) {
        if (shouldLogFallback(Date.now())) {
          log.error(
            failClosed
              ? "shared rate limit unavailable, refusing (fail closed)"
              : "shared rate limit unavailable, using per-instance memory (apply migration 20260929120000?)",
            { name, code: error?.code },
            error ?? undefined,
          );
        }
        if (failClosed) return { ok: false, remaining: 0, retryAfterSeconds: FAIL_CLOSED_RETRY_SECONDS, degraded: true };
        return { ...fromMemory(key), degraded: true };
      }
      return {
        ok: hit.allowed,
        remaining: hit.allowed ? 1 : 0,
        retryAfterSeconds: hit.allowed ? 0 : hit.retryAfter,
        degraded: false,
      };
    },
  };
}
