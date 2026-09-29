import "server-only";
import { createHash, createHmac } from "node:crypto";
import { getSigningSecret } from "@/lib/config.server";
import { log } from "@/lib/log";
import { createRateLimiter, type RateLimitResult } from "@/lib/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Rate limiter shared by every serverless instance: counters live in Postgres
 * (rate_limit_hit(), migration 20260929120000). Keys are keyed hashes (HMAC
 * with PASSME_SIGNING_SECRET), so no raw IPs are stored and an IP can't be
 * recovered from its hash by brute force. Falls back to the per-instance
 * memory limiter when the secret key is missing (demo, tests) or the database
 * call fails, so a Supabase hiccup never takes the site down.
 */

export interface SharedRateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

interface Options {
  /** Namespace, e.g. "login-ip". Different limiters never share counters. */
  name: string;
  limit: number;
  windowMs: number;
}

let warnedFallback = false;

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

export function createSharedRateLimiter({ name, limit, windowMs }: Options): SharedRateLimiter {
  const memory = createRateLimiter({ limit, windowMs });
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  return {
    async check(key) {
      const admin = createAdminSupabase();
      if (!admin) return memory.check(`${name}:${key}`);

      const { data, error } = await admin.rpc("rate_limit_hit", {
        p_key: hashKey(name, key),
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      const hit = error ? null : parseHit(data);
      if (!hit) {
        if (!warnedFallback) {
          warnedFallback = true;
          log.warn("shared rate limit unavailable, using memory (apply migration 20260929120000?)", { name }, error);
        }
        return memory.check(`${name}:${key}`);
      }
      return { ok: hit.allowed, remaining: hit.allowed ? 1 : 0, retryAfterSeconds: hit.allowed ? 0 : hit.retryAfter };
    },
  };
}
