import "server-only";
import { getAppleWalletConfig, type AppleWalletConfig } from "@/lib/config.server";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { isUuid, parseApplePassAuth, verifyApplePassToken } from "@/lib/data/wallet";
import { log } from "@/lib/log";
import { clientRateKey } from "@/lib/request";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

/**
 * Shared plumbing for the Apple Wallet web service
 * (https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes).
 * Apple appends /v1/... to the pass's webServiceURL (= {site}/api/wallet).
 */

const DEVICE_ID_RE = /^[A-Za-z0-9]{1,128}$/;
/** Seconds a client should wait before retrying a 429/503. */
const RETRY_AFTER_SECONDS = 30;

/**
 * Every web-service route is open to the internet (the serial list has no auth
 * by Apple's design, the rest answer to a per-pass token), and each request
 * costs a database query. A phone talks to this a handful of times a day, so
 * 300 a minute per address (carrier NAT included) is far above real use.
 */
const ipLimiter = createSharedRateLimiter({ name: "wallet-ws-ip", limit: 300, windowMs: 60_000 });
/** Building and signing a .pkpass is the costly part: cap it per pass, whoever asks. */
const refreshLimiter = createSharedRateLimiter({ name: "wallet-pass-serial", limit: 60, windowMs: 10 * 60_000 });

export interface WebServiceContext {
  config: AppleWalletConfig;
  admin: TypedSupabaseClient;
}

export type ContextResult = { ok: true; ctx: WebServiceContext } | { ok: false; response: Response };

const empty = (status: number) => new Response(null, { status });

function withRetryAfter(status: number, seconds = RETRY_AFTER_SECONDS): Response {
  return new Response(null, { status, headers: { "Retry-After": String(seconds) } });
}

/** 503 + Retry-After: "try again", unlike a 401/404 that makes Wallet give up on the pass. */
export const unavailableResponse = (): Response => withRetryAfter(503);

export function getWebServiceContext(): ContextResult {
  const config = getAppleWalletConfig();
  const admin = createAdminSupabase();
  if (!config?.webServiceEnabled || !admin) return { ok: false, response: empty(404) };
  return { ok: true, ctx: { config, admin } };
}

/**
 * Entry point of every web-service route except /log: the context, behind the
 * per-address limiter, which runs before any lookup in our own tables.
 */
export async function openWebService(request: Request): Promise<ContextResult> {
  const context = getWebServiceContext();
  if (!context.ok) return context;
  const rate = await ipLimiter.check(clientRateKey(request.headers));
  if (!rate.ok) return { ok: false, response: withRetryAfter(429, rate.retryAfterSeconds || RETRY_AFTER_SECONDS) };
  return context;
}

/** Per-pass cap on full pass downloads (a 304 is cheap and doesn't count). Null = go ahead. */
export async function limitPassRefresh(serial: string): Promise<Response | null> {
  const rate = await refreshLimiter.check(serial);
  return rate.ok ? null : withRetryAfter(429, rate.retryAfterSeconds || RETRY_AFTER_SECONDS);
}

export function isValidDeviceId(value: string): boolean {
  return DEVICE_ID_RE.test(value);
}

/**
 * Checks pass type + serial shape and the ApplePass authorization header.
 * 404 for a malformed request, 401 for a missing/wrong token, 503 when we
 * can't tell (database down): a 401 would make Wallet stop updating the pass.
 */
export async function authorizePass(
  ctx: WebServiceContext,
  request: Request,
  passTypeId: string,
  serial: string,
): Promise<Response | null> {
  if (passTypeId !== ctx.config.passTypeId || !isUuid(serial)) return empty(404);
  const token = parseApplePassAuth(request.headers.get("authorization"));
  try {
    return (await verifyApplePassToken(ctx.admin, serial, token)) ? null : empty(401);
  } catch (error) {
    log.error("wallet pass token check failed", { profileId: serial }, error);
    return unavailableResponse();
  }
}

export { empty as emptyResponse };
export { isValidPushToken } from "./apns";
