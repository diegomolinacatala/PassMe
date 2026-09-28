import "server-only";
import { getSiteUrl, isSupabaseConfigured } from "./env";

/**
 * Server-only secrets. Certificates and keys can be given either as raw PEM
 * (with literal "\n" sequences, as most dashboards store them) or base64
 * encoded PEM, which survives copy/paste into Vercel without newline issues.
 */

export const MIN_SIGNING_SECRET_LENGTH = 32;

export function decodePem(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.includes("-----BEGIN")) return trimmed.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return decoded.includes("-----BEGIN") ? decoded : null;
  } catch {
    return null;
  }
}

export function getSupabaseSecretKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

/** Secret for short-lived "send the pass to my phone" links. */
export function getSigningSecret(): string | null {
  const secret = process.env.PASSME_SIGNING_SECRET;
  return secret && secret.length >= MIN_SIGNING_SECRET_LENGTH ? secret : null;
}

export interface AppleWalletConfig {
  passTypeId: string;
  teamId: string;
  signerCert: string;
  signerKey: string;
  signerKeyPassphrase?: string;
  wwdr: string;
  /** Registers passes for push updates (needs https + Supabase secret key). */
  webServiceEnabled: boolean;
  apnsHost: string;
}

export function getAppleWalletConfig(): AppleWalletConfig | null {
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const signerCert = decodePem(process.env.APPLE_PASS_CERT);
  const signerKey = decodePem(process.env.APPLE_PASS_KEY);
  const wwdr = decodePem(process.env.APPLE_WWDR_CERT);
  if (!passTypeId || !teamId || !signerCert || !signerKey || !wwdr) return null;

  const webServiceEnabled =
    process.env.APPLE_WALLET_WEB_SERVICE !== "false" &&
    getSiteUrl().startsWith("https://") &&
    getSupabaseSecretKey() !== null;

  return {
    passTypeId,
    teamId,
    signerCert,
    signerKey,
    signerKeyPassphrase: process.env.APPLE_PASS_KEY_PASSPHRASE || undefined,
    wwdr,
    webServiceEnabled,
    apnsHost: process.env.APPLE_APNS_HOST || "https://api.push.apple.com",
  };
}

export interface GoogleWalletConfig {
  issuerId: string;
  serviceAccountEmail: string;
  privateKey: string;
  /** Pass class id suffix; bump it to roll out a new class design. */
  classSuffix: string;
}

interface ServiceAccountJson {
  client_email?: string;
  private_key?: string;
}

function parseServiceAccount(raw: string | undefined): ServiceAccountJson | null {
  if (!raw?.trim()) return null;
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  try {
    return JSON.parse(text) as ServiceAccountJson;
  } catch {
    return null;
  }
}

export function getGoogleWalletConfig(): GoogleWalletConfig | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const json = parseServiceAccount(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON);
  const serviceAccountEmail = json?.client_email ?? process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
  const privateKey = decodePem(json?.private_key ?? process.env.GOOGLE_WALLET_PRIVATE_KEY);
  if (!issuerId || !serviceAccountEmail || !privateKey) return null;

  return {
    issuerId,
    serviceAccountEmail,
    privateKey,
    classSuffix: process.env.GOOGLE_WALLET_CLASS_SUFFIX || "passme_card_v1",
  };
}

export interface ConfigStatus {
  siteUrl: string;
  supabase: boolean;
  supabaseSecretKey: boolean;
  signingSecret: boolean;
  appleWallet: boolean;
  appleWebService: boolean;
  googleWallet: boolean;
}

/** Booleans only — safe to expose on a health endpoint. */
export function getConfigStatus(): ConfigStatus {
  const apple = getAppleWalletConfig();
  return {
    siteUrl: getSiteUrl(),
    supabase: isSupabaseConfigured(),
    supabaseSecretKey: getSupabaseSecretKey() !== null,
    signingSecret: getSigningSecret() !== null,
    appleWallet: apple !== null,
    appleWebService: apple?.webServiceEnabled ?? false,
    googleWallet: getGoogleWalletConfig() !== null,
  };
}
