import { getConfigStatus } from "@/lib/config.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deployment smoke test: which integrations are configured (booleans only,
 * never secrets). Open /api/health after each deploy.
 */
export function GET() {
  const status = getConfigStatus();
  return Response.json(
    { ok: status.supabase, ...status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
