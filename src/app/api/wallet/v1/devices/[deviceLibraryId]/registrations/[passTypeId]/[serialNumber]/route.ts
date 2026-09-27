import type { NextRequest } from "next/server";
import { registerDevice, unregisterDevice } from "@/lib/data/wallet";
import { log } from "@/lib/log";
import {
  authorizePass,
  emptyResponse,
  getWebServiceContext,
  isValidDeviceId,
  isValidPushToken,
} from "@/lib/pass/web-service";

export const runtime = "nodejs";

type Ctx = RouteContext<"/api/wallet/v1/devices/[deviceLibraryId]/registrations/[passTypeId]/[serialNumber]">;

/** Apple Wallet: a device added the pass and wants push updates. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const context = getWebServiceContext();
  if (!context.ok) return context.response;
  const { deviceLibraryId, passTypeId, serialNumber } = await params;
  if (!isValidDeviceId(deviceLibraryId)) return emptyResponse(400);

  const denied = await authorizePass(context.ctx, request, passTypeId, serialNumber);
  if (denied) return denied;

  let pushToken: unknown;
  try {
    pushToken = ((await request.json()) as { pushToken?: unknown }).pushToken;
  } catch {
    return emptyResponse(400);
  }
  if (!isValidPushToken(pushToken)) return emptyResponse(400);

  try {
    const created = await registerDevice(context.ctx.admin, { deviceLibraryId, passTypeId, serial: serialNumber }, pushToken);
    return emptyResponse(created ? 201 : 200);
  } catch (error) {
    log.error("wallet register failed", { serialNumber }, error);
    return emptyResponse(500);
  }
}

/** Apple Wallet: the pass was removed from a device. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const context = getWebServiceContext();
  if (!context.ok) return context.response;
  const { deviceLibraryId, passTypeId, serialNumber } = await params;
  if (!isValidDeviceId(deviceLibraryId)) return emptyResponse(400);

  const denied = await authorizePass(context.ctx, request, passTypeId, serialNumber);
  if (denied) return denied;

  try {
    await unregisterDevice(context.ctx.admin, { deviceLibraryId, passTypeId, serial: serialNumber });
    return emptyResponse(200);
  } catch (error) {
    log.error("wallet unregister failed", { serialNumber }, error);
    return emptyResponse(500);
  }
}
