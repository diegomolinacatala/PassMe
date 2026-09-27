import "server-only";
import { DEMO_CARD } from "@/lib/card/demo";
import type { OwnerCard } from "@/lib/card/types";
import { getAppleWalletConfig, getGoogleWalletConfig } from "@/lib/config.server";
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
import { sendPassUpdatePushes } from "./apns";
import { createApplePass } from "./apple";
import { createGoogleSaveUrl, syncGoogleObject } from "./google";
import { verifyHandoffToken } from "./handoff";
import { fetchAvatar } from "./images";

export class PassError extends Error {
  constructor(
    readonly status: number,
    readonly code: "not_configured" | "unauthorized" | "not_found" | "incomplete",
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
  if (!user) throw new PassError(401, "unauthorized", "Inicia sesión para descargar tu pase.");
  return user.id;
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
  const [authenticationToken, avatar] = await Promise.all([
    config.webServiceEnabled ? ensureApplePassToken(admin, card.id) : Promise.resolve(undefined),
    fetchAvatar(card.avatarUrl),
  ]);

  const buffer = await createApplePass(
    { card: toPublicCard(card), serialNumber: card.id, authenticationToken, avatar },
    config,
  );
  return { buffer, slug: card.slug };
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
  return createGoogleSaveUrl(config, { card: toPublicCard(card), profileId: card.id });
}

export async function buildDemoGoogleSaveUrl(): Promise<string> {
  const config = getGoogleWalletConfig();
  if (!config) throw new PassError(503, "not_configured", "Google Wallet no está configurado todavía.");
  return createGoogleSaveUrl(config, { card: toPublicCard(DEMO_CARD), profileId: DEMO_CARD.id });
}

/**
 * After the owner saves: nudge Apple devices to re-download the pass and
 * update the Google Wallet object. Best effort, runs in `after()`.
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
        await deleteRegistrationsForPushTokens(admin, apple.passTypeId, summary.invalidTokens);
        log.info("apple pass push", { profileId, sent: summary.sent, failed: summary.failed });
      })(),
    );
  }

  if (google) {
    tasks.push(
      (async () => {
        const card = await getCardById(admin, profileId);
        if (!card?.fullName) return;
        const result = await syncGoogleObject(google, { card: toPublicCard(card), profileId });
        if (result !== "not_saved") log.info("google pass sync", { profileId, result });
      })(),
    );
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") log.warn("wallet update failed", { profileId }, result.reason);
  }
}
