import type { NextRequest } from "next/server";
import { log } from "@/lib/log";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { clientRateKey, readTextLimited } from "@/lib/request";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_ENTRIES = 10;
const limiter = createSharedRateLimiter({ name: "wallet-log-ip", limit: 30, windowMs: 60_000 });

/** Apple Wallet reports web-service problems here — invaluable when debugging pass updates. */
export async function POST(request: NextRequest) {
  if (!(await limiter.check(clientRateKey(request.headers))).ok) return new Response(null, { status: 429 });

  const raw = await readTextLimited(request, MAX_BODY_BYTES);
  if (raw === null) return new Response(null, { status: 413 });

  try {
    const body = JSON.parse(raw) as { logs?: unknown };
    const logs = Array.isArray(body.logs) ? body.logs.slice(0, MAX_ENTRIES).map((l) => String(l).slice(0, 500)) : [];
    if (logs.length > 0) log.warn("apple wallet device log", { logs });
  } catch {
    return new Response(null, { status: 400 });
  }
  return new Response(null, { status: 200 });
}
