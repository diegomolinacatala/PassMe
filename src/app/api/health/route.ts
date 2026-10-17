import { getConfigStatus, hasValidCronSecret } from "@/lib/config.server";
import { isSupabaseConfigured } from "@/lib/env";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let reportedDemoInProduction = false;

/**
 * Deployment smoke test. Publicly it answers only `{ ok }`: true when the app
 * has Supabase (without it the site runs in demo mode, which in production
 * means a deploy that lost its environment: 503 and one error line). The
 * detail of which integrations are configured (booleans, never secrets) is for
 * whoever holds `Authorization: Bearer $CRON_SECRET`.
 */
export function GET(request: Request) {
  const supabase = isSupabaseConfigured();
  const demoInProduction = process.env.VERCEL_ENV === "production" && !supabase;
  if (demoInProduction && !reportedDemoInProduction) {
    reportedDemoInProduction = true;
    log.error("health check: production is running in demo mode (Supabase environment variables are missing)");
  }

  const body = hasValidCronSecret(request.headers.get("authorization"))
    ? { ok: supabase, ...getConfigStatus() }
    : { ok: supabase };
  return Response.json(body, { status: demoInProduction ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
