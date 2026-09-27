import type { NextRequest } from "next/server";
import { getCardById } from "@/lib/data/wallet";
import { log } from "@/lib/log";
import { PKPASS_CONTENT_TYPE } from "@/lib/pass/apple";
import { buildApplePassForCard, PassError } from "@/lib/pass/service";
import { authorizePass, emptyResponse, getWebServiceContext } from "@/lib/pass/web-service";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Apple Wallet: download the latest version of a pass (honours If-Modified-Since). */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/wallet/v1/passes/[passTypeId]/[serialNumber]">,
) {
  const context = getWebServiceContext();
  if (!context.ok) return context.response;
  const { passTypeId, serialNumber } = await params;

  const denied = await authorizePass(context.ctx, request, passTypeId, serialNumber);
  if (denied) return denied;

  try {
    const card = await getCardById(context.ctx.admin, serialNumber);
    if (!card) return emptyResponse(404);

    // HTTP dates have second precision; compare at that resolution.
    const lastModified = new Date(Math.floor(Date.parse(card.updatedAt) / 1000) * 1000);
    const ifModifiedSince = Date.parse(request.headers.get("if-modified-since") ?? "");
    if (!Number.isNaN(ifModifiedSince) && lastModified.getTime() <= ifModifiedSince) return emptyResponse(304);

    const pass = await buildApplePassForCard(card);
    return new Response(new Uint8Array(pass.buffer), {
      headers: {
        "Content-Type": PKPASS_CONTENT_TYPE,
        "Last-Modified": lastModified.toUTCString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PassError) return emptyResponse(error.status === 409 ? 404 : error.status);
    log.error("wallet latest pass failed", { serialNumber }, error);
    return emptyResponse(500);
  }
}
