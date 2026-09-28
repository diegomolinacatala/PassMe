/**
 * Fixed-window, in-memory rate limiter.
 *
 * Good enough for an MVP on Vercel: each serverless instance keeps its own
 * counters, so the effective limit is per instance. For hard guarantees move
 * this to Upstash Redis / Vercel KV or enable Vercel Firewall rate limiting.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_TRACKED_KEYS = 10_000;

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function prune(now: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    check(key, now = Date.now()) {
      if (buckets.size > MAX_TRACKED_KEYS) prune(now);

      const current = buckets.get(key);
      const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
      const next = { count: bucket.count + 1, resetAt: bucket.resetAt };
      buckets.set(key, next);

      const ok = next.count <= limit;
      return {
        ok,
        remaining: Math.max(0, limit - next.count),
        retryAfterSeconds: ok ? 0 : Math.ceil((next.resetAt - now) / 1000),
      };
    },
  };
}
