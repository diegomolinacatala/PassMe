import "server-only";
import { DEMO_CARD } from "@/lib/card/demo";
import type { OwnerCard } from "@/lib/card/types";
import { getAppleWalletConfig, getGoogleWalletConfig, getSupabaseSecretKey, isGoogleWalletLive } from "@/lib/config.server";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { toPublicCard } from "@/lib/data/cards";
import {
  deleteRegistrationsForPushTokens,
  ensureApplePassToken,
  getCardById,
  getPushTokensForSerial,
} from "@/lib/data/wallet";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";
import { sendPassUpdatePushes, type PushSummary } from "./apns";
import { createApplePass } from "./apple";
import { createGoogleSaveUrl, syncGoogleObject } from "./google";
import { verifyHandoffToken } from "./handoff";
import { fetchAvatarResult } from "./images";

export class PassError extends Error {
  constructor(
    readonly status: number,
    readonly code: "not_configured" | "unauthorized" | "not_found" | "incomplete" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

/** The card whose pass is being requested: via session cookie or a handoff token. */
export async function resolvePassOwnerId(handoffToken: string | null): Promise<string> {
  const fromToken = await verifyHandoffToken(handoffToken);
  if (fromToken) return fromToken;

  const supabase = await createServerSupabase();
  const user = supabase ? await getSessionUser(supabase) : null;
  if (!user) throw new PassError(401, "unauthorized", "Entra con tu email para descargar tu pase.");
  return user.id;
}

/**
 * The sample pass is signed with the real certificate, so once accounts exist
 * only signed-in users may download it (handy to test a phone before saving a
 * card). Before Supabase is connected it stays open for the setup checks.
 */
export async function assertDemoPassAllowed(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createServerSupabase();
  const user = supabase ? await getSessionUser(supabase) : null;
  if (!user) throw new PassError(401, "unauthorized", "Entra con tu email para descargar el pase de ejemplo.");
}

async function loadOwnerCard(profileId: string): Promise<OwnerCard> {
  const admin = createAdminSupabase();
  if (!admin) throw new PassError(503, "not_configured", "Falta SUPABASE_SECRET_KEY en el servidor.");
  const card = await getCardById(admin, profileId);
  if (!card) throw new PassError(404, "not_found", "Tarjeta no encontrada.");
  if (!card.fullName) throw new PassError(409, "incomplete", "Añade tu nombre y guarda la tarjeta primero.");
  return card;
}

export interface GeneratedApplePass {
  buffer: Buffer;
  slug: string;
}

export async function buildApplePassForProfile(profileId: string): Promise<GeneratedApplePass> {
  return buildApplePassForCard(await loadOwnerCard(profileId));
}

/** Builds the pass for an already-loaded card (avoids a second read in the web service). */
export async function buildApplePassForCard(card: OwnerCard): Promise<GeneratedApplePass> {
  const config = getAppleWalletConfig();
  if (!config) throw new PassError(503, "not_configured", "Apple Wallet no está configurado todavía.");
  if (!card.fullName) throw new PassError(409, "incomplete", "Añade tu nombre y guarda la tarjeta primero.");

  const admin = createAdminSupabase();
  if (!admin) throw new PassError(503, "not_configured", "Falta SUPABASE_SECRET_KEY en el servidor.");
  if (!config.webServiceEnabled) warnWebServiceOff(card.id);

  const [authenticationToken, avatar] = await Promise.all([
    config.webServiceEnabled ? ensureApplePassToken(admin, card.id) : Promise.resolve(undefined),
    fetchAvatarResult(card.avatarUrl, { slug: card.slug, profileId: card.id }),
  ]);
  // A pass is only refreshed when the card changes: building it without a photo
  // because storage blinked would leave it photo-less on the phone for good.
  if (avatar.status === "transient") {
    throw new PassError(503, "unavailable", "No hemos podido cargar tu foto. Inténtalo de nuevo en un momento.");
  }

  const buffer = await createApplePass(
    {
      card: toPublicCard(card),
      serialNumber: card.id,
      authenticationToken,
      avatar: avatar.status === "ok" ? avatar.buffer : null,
      paused: !card.isPublished,
    },
    config,
  );
  return { buffer, slug: card.slug };
}

/** Without the web service a pass never updates: in production that's a misconfiguration worth a log line. */
function warnWebServiceOff(profileId: string): void {
  if (process.env.VERCEL_ENV !== "production") return;
  const reasons = [
    process.env.APPLE_WALLET_WEB_SERVICE === "false" && "APPLE_WALLET_WEB_SERVICE=false",
    !getSiteUrl().startsWith("https://") && "the site URL is not https",
    getSupabaseSecretKey() === null && "no Supabase secret key",
  ].filter((reason): reason is string => Boolean(reason));
  log.warn("apple pass built without the update web service: it will never refresh", { profileId, reasons: reasons.join("; ") });
}

/** Sample pass (/api/pass/apple?demo=1) to test Apple certificates before Supabase exists. */
export async function buildDemoApplePass(): Promise<GeneratedApplePass> {
  const config = getAppleWalletConfig();
  if (!config) throw new PassError(503, "not_configured", "Apple Wallet no está configurado todavía.");
  const buffer = await createApplePass(
    { card: toPublicCard(DEMO_CARD), serialNumber: DEMO_CARD.id },
    { ...config, webServiceEnabled: false },
  );
  return { buffer, slug: DEMO_CARD.slug };
}

export async function buildGoogleSaveUrlForProfile(profileId: string): Promise<string> {
  const config = getGoogleWalletConfig();
  if (!config) throw new PassError(503, "not_configured", "Google Wallet no está configurado todavía.");
  const card = await loadOwnerCard(profileId);
  return createGoogleSaveUrl(config, { card: toPublicCard(card), profileId: card.id, paused: googlePaused(card) });
}

/** Only touch the Google object's state once Google Wallet is live (GOOGLE_WALLET_LIVE). */
function googlePaused(card: OwnerCard): boolean {
  return !card.isPublished && isGoogleWalletLive();
}

export async function buildDemoGoogleSaveUrl(): Promise<string> {
  const config = getGoogleWalletConfig();
  if (!config) throw new PassError(503, "not_configured", "Google Wallet no está configurado todavía.");
  return createGoogleSaveUrl(config, { card: toPublicCard(DEMO_CARD), profileId: DEMO_CARD.id });
}

function logPushSummary(profileId: string, summary: PushSummary): void {
  const context = {
    profileId,
    sent: summary.sent,
    failed: summary.failed,
    dead: summary.invalidTokens.length,
    outcomes: summary.outcomes,
  };
  if (summary.sent === 0 && summary.failed > 0) log.error("apple pass push: nothing was delivered", context);
  else if (summary.failed > 0) log.warn("apple pass push: some pushes failed", context);
  else log.info("apple pass push", context);
}

/**
 * After the owner saves: nudge Apple devices to re-download the pass and
 * update the Google Wallet object. Best effort, runs in `after()`. Also how
 * unpublishing pauses the passes (voided / INACTIVE) and publishing restores them.
 */
export async function notifyWalletsOfUpdate(profileId: string): Promise<void> {
  const admin = createAdminSupabase();
  if (!admin) return;

  const apple = getAppleWalletConfig();
  const google = getGoogleWalletConfig();

  const tasks: Promise<unknown>[] = [];

  if (apple?.webServiceEnabled) {
    tasks.push(
      (async () => {
        const tokens = await getPushTokensForSerial(admin, apple.passTypeId, profileId);
        if (tokens.length === 0) return;
        const summary = await sendPassUpdatePushes(apple, tokens);
        // Report first: a failing cleanup below must not hide how the pushes went.
        logPushSummary(profileId, summary);
        await deleteRegistrationsForPushTokens(admin, apple.passTypeId, summary.invalidTokens);
      })(),
    );
  }

  // Before Google approves the issuer nobody holds an object, so each sync would only spend API quota.
  if (google && isGoogleWalletLive()) {
    tasks.push(
      (async () => {
        const card = await getCardById(admin, profileId);
        if (!card?.fullName) return;
        const result = await syncGoogleObject(google, { card: toPublicCard(card), profileId, paused: googlePaused(card) });
        if (result !== "not_saved") log.info("google pass sync", { profileId, result });
      })(),
    );
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") log.warn("wallet update failed", { profileId }, result.reason);
  }
}

export interface WithdrawSummary {
  /**
   * expired:   the Google object now says "Tarjeta eliminada" and is EXPIRED, with no personal data
   * not_saved: nobody ever saved it to Google Wallet
   * off:       Google Wallet isn't configured, or the card was already gone
   * failed:    Google didn't take it (logged); worth a retry or a manual look
   */
  google: "expired" | "not_saved" | "off" | "failed";
}

/**
 * For a deleted account: replaces the Google Wallet object with an EXPIRED stub
 * so the person's name, role, links and photo stop living in Google's store and
 * in other people's wallets. Call it BEFORE the account is deleted and await it
 * (not in `after()`): it needs the card's slug, and the card is gone afterwards.
 * Best effort, never throws.
 *
 * Apple copies can't be recalled this way: Wallet only learns about a change
 * by calling our web service with the pass's token, and deleting the account
 * cascades the token away at once (the pass stays on the phone, frozen). A real
 * recall needs a deferred deletion: unpublish (the pass becomes the paused stub),
 * push, delete a few minutes later.
 */
export async function withdrawWalletPasses(profileId: string): Promise<WithdrawSummary> {
  const google = getGoogleWalletConfig();
  const admin = createAdminSupabase();
  // Not gated on GOOGLE_WALLET_LIVE: test accounts may hold an object before launch, and a 404 costs nothing.
  if (!google || !admin) return { google: "off" };

  try {
    const card = await getCardById(admin, profileId);
    if (!card) {
      log.warn("wallet withdrawal skipped: card not found", { profileId });
      return { google: "off" };
    }
    const result = await syncGoogleObject(google, { card: toPublicCard(card), profileId, withdrawn: true });
    if (result === "failed") log.error("google pass withdrawal failed", { profileId });
    else log.info("google pass withdrawn", { profileId, result });
    return { google: result === "updated" ? "expired" : result };
  } catch (error) {
    log.error("google pass withdrawal threw", { profileId }, error);
    return { google: "failed" };
  }
}
