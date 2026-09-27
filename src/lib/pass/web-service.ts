import "server-only";
import { getAppleWalletConfig, type AppleWalletConfig } from "@/lib/config.server";
import { isUuid, parseApplePassAuth, verifyApplePassToken } from "@/lib/data/wallet";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

/**
 * Shared plumbing for the Apple Wallet web service
 * (https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes).
 * Apple appends /v1/... to the pass's webServiceURL (= {site}/api/wallet).
 */

const DEVICE_ID_RE = /^[A-Za-z0-9]{1,128}$/;

export interface WebServiceContext {
  config: AppleWalletConfig;
  admin: TypedSupabaseClient;
}

export type ContextResult = { ok: true; ctx: WebServiceContext } | { ok: false; response: Response };

const empty = (status: number) => new Response(null, { status });

export function getWebServiceContext(): ContextResult {
  const config = getAppleWalletConfig();
  const admin = createAdminSupabase();
  if (!config?.webServiceEnabled || !admin) return { ok: false, response: empty(404) };
  return { ok: true, ctx: { config, admin } };
}

export function isValidDeviceId(value: string): boolean {
  return DEVICE_ID_RE.test(value);
}

/** Checks pass type + serial shape and the ApplePass authorization header. */
export async function authorizePass(
  ctx: WebServiceContext,
  request: Request,
  passTypeId: string,
  serial: string,
): Promise<Response | null> {
  if (passTypeId !== ctx.config.passTypeId || !isUuid(serial)) return empty(404);
  const token = parseApplePassAuth(request.headers.get("authorization"));
  const authorized = await verifyApplePassToken(ctx.admin, serial, token);
  return authorized ? null : empty(401);
}

export { empty as emptyResponse };
export { isValidPushToken } from "./apns";
