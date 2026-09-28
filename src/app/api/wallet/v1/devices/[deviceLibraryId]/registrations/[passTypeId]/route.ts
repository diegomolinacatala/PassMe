import type { NextRequest } from "next/server";
import { listUpdatedSerials } from "@/lib/data/wallet";
import { log } from "@/lib/log";
import { emptyResponse, getWebServiceContext, isValidDeviceId } from "@/lib/pass/web-service";

export const runtime = "nodejs";

/** Apple Wallet: which of this device's passes changed since `passesUpdatedSince`? (no auth header by spec) */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/wallet/v1/devices/[deviceLibraryId]/registrations/[passTypeId]">,
) {
  const context = getWebServiceContext();
  if (!context.ok) return context.response;
  const { deviceLibraryId, passTypeId } = await params;
  if (!isValidDeviceId(deviceLibraryId) || passTypeId !== context.ctx.config.passTypeId) return emptyResponse(404);

  try {
    const since = request.nextUrl.searchParams.get("passesUpdatedSince");
    const result = await listUpdatedSerials(context.ctx.admin, deviceLibraryId, passTypeId, since);
    if (!result) return emptyResponse(204);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    log.error("wallet serial list failed", {}, error);
    return emptyResponse(500);
  }
}
