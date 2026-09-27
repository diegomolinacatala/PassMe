import type { NextRequest } from "next/server";
import { log } from "@/lib/log";
import { createRateLimiter } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_ENTRIES = 10;
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

/** Apple Wallet reports web-service problems here — invaluable when debugging pass updates. */
export async function POST(request: NextRequest) {
  if (!limiter.check(getClientIp(request.headers)).ok) return new Response(null, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  try {
    const body = JSON.parse(raw) as { logs?: unknown };
    const logs = Array.isArray(body.logs) ? body.logs.slice(0, MAX_ENTRIES).map((l) => String(l).slice(0, 500)) : [];
    if (logs.length > 0) log.warn("apple wallet device log", { logs });
  } catch {
    return new Response(null, { status: 400 });
  }
  return new Response(null, { status: 200 });
}
