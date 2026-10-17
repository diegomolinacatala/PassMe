import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { log } from "@/lib/log";
import { notifyExpiredProposals, type ExpiryRun } from "@/lib/meetings/service";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_SECRET_LENGTH = 16;

function isAuthorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

let warnedClosed = false;

/** Without the secret the route answers 404 to everyone, including Vercel's cron: say so once, loudly, in production. */
function warnWhenClosed(): void {
  if (warnedClosed) return;
  if (process.env.VERCEL_ENV !== "production" && process.env.NODE_ENV !== "production") return;
  warnedClosed = true;
  log.error(`cron closed: CRON_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters, so the daily cleanup and the expiry notices are not running`);
}

/**
 * Daily job (vercel.json → crons). Vercel sends "Authorization: Bearer $CRON_SECRET";
 * without that variable the route stays closed.
 *
 * Order matters: the retention cleanup comes first and always runs. The «ha caducado»
 * emails come after, bounded in count and time (see notifyExpiredProposals), so a
 * flood of expiring proposals or a slow mail provider can never keep the cleanup from running.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    warnWhenClosed();
    return new Response(null, { status: 404 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) return new Response(null, { status: 401 });

  const admin = createAdminSupabase();
  if (!admin) {
    log.error("cron cannot run: no database access (SUPABASE_SECRET_KEY)");
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const { data, error } = await admin.rpc("cleanup_expired_data");
  if (error) log.error("cleanup_expired_data failed", {}, error);

  // Best effort: the notices must not turn a good cleanup into a failed run.
  let expiry: ExpiryRun | null = null;
  try {
    expiry = await notifyExpiredProposals(new Date());
  } catch (cause) {
    log.error("expired proposal emails failed", {}, cause);
  }
  if (expiry?.problem) log.error("expired proposal emails not tried", { problem: expiry.problem });
  else if (expiry && (expiry.failed > 0 || expiry.truncated)) log.warn("expired proposal emails incomplete", { ...expiry });

  if (!error) log.info("cleanup_expired_data", { removed: data, expiry });
  return Response.json(
    { ok: !error, removed: error ? null : data, expiredProposals: expiry?.qualified ?? 0, expiryNotices: expiry },
    { status: error ? 500 : 200 },
  );
}
