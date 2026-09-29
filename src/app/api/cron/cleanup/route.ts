import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Daily retention job (vercel.json → crons). Vercel sends
 * "Authorization: Bearer $CRON_SECRET"; without that variable the route stays closed.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return new Response(null, { status: 404 });
  if (!isAuthorized(request.headers.get("authorization"), secret)) return new Response(null, { status: 401 });

  const admin = createAdminSupabase();
  if (!admin) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });

  const { data, error } = await admin.rpc("cleanup_expired_data");
  if (error) {
    log.error("cleanup_expired_data failed", {}, error);
    return Response.json({ ok: false }, { status: 500 });
  }
  log.info("cleanup_expired_data", { removed: data });
  return Response.json({ ok: true, removed: data });
}
