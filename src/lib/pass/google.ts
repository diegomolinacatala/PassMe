import "server-only";
import { importPKCS8, SignJWT } from "jose";
import { resolveDesign } from "@/lib/card/design";
import { linkHref, linkTitle } from "@/lib/card/links";
import type { PublicCard } from "@/lib/card/types";
import type { GoogleWalletConfig } from "@/lib/config.server";
import { getSiteUrl, prettyProfileUrl, profileUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { artVersion } from "./art";

/**
 * Google Wallet "Generic pass" for a contact card. The card's artwork (motif
 * around the PassMe mark, no name) is the hero image, served by /u/[slug]/hero.
 *
 * Adding: we sign a "Save to Google Wallet" JWT that embeds both the class and
 * the object, so Google creates them on first save (no API call needed).
 * Updating: after the owner edits their card we PUT the object through the
 * Wallet REST API (best effort — 404 simply means it was never saved).
 */

const SAVE_URL = "https://pay.google.com/gp/v/save/";
const API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const LANGUAGE = "es";
const MAX_LINKS = 8;

type LocalizedString = { defaultValue: { language: string; value: string } };

const localized = (value: string): LocalizedString => ({ defaultValue: { language: LANGUAGE, value } });

export function googleClassId(config: GoogleWalletConfig): string {
  return `${config.issuerId}.${config.classSuffix}`;
}

export function googleObjectId(config: GoogleWalletConfig, profileId: string): string {
  return `${config.issuerId}.card-${profileId}`;
}

export function buildGenericClass(config: GoogleWalletConfig) {
  return {
    id: googleClassId(config),
    issuerName: "PassMe",
    multipleDevicesAndHoldersAllowedStatus: "MULTIPLE_HOLDERS",
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [
          {
            twoItems: {
              startItem: { firstValue: { fields: [{ fieldPath: "object.textModulesData['company']" }] } },
              endItem: { firstValue: { fields: [{ fieldPath: "object.textModulesData['location']" }] } },
            },
          },
        ],
      },
    },
  };
}

export interface GooglePassInput {
  card: PublicCard;
  profileId: string;
}

export function buildGenericObject(config: GoogleWalletConfig, { card, profileId }: GooglePassInput) {
  const design = resolveDesign(card);
  const logoUri = card.avatarUrl ?? `${getSiteUrl()}/brand/wallet-logo.png`;
  const heroUri = `${profileUrl(card.slug)}/hero?v=${artVersion(card, "hero")}`;

  // Ids match the class template rows (company | location), which is unchanged
  // since v1 so existing issuer classes keep working without a new suffix.
  const textModulesData = [
    card.company ? { id: "company", header: "Empresa", body: card.company } : null,
    card.location ? { id: "location", header: "Ubicación", body: card.location } : null,
    card.pronouns ? { id: "pronouns", header: "Pronombres", body: card.pronouns } : null,
    card.bio ? { id: "bio", header: "Sobre mí", body: card.bio } : null,
  ].filter((m): m is { id: string; header: string; body: string } => m !== null);

  const uris = [
    { id: "card", uri: profileUrl(card.slug), description: "Ver tarjeta completa" },
    ...card.links.slice(0, MAX_LINKS).map((link, index) => ({
      id: `link_${index}`,
      uri: linkHref(link.kind, link.value),
      description: linkTitle(link),
    })),
  ];

  return {
    id: googleObjectId(config, profileId),
    classId: googleClassId(config),
    state: "ACTIVE",
    cardTitle: localized(card.company || "PassMe"),
    header: localized(card.fullName),
    ...(card.headline ? { subheader: localized(card.headline) } : {}),
    hexBackgroundColor: design.background,
    logo: {
      sourceUri: { uri: logoUri },
      contentDescription: localized(card.avatarUrl ? `Foto de ${card.fullName}` : "PassMe"),
    },
    heroImage: {
      sourceUri: { uri: heroUri },
      contentDescription: localized(`Diseño de la tarjeta de ${card.fullName}`),
    },
    barcode: {
      type: "QR_CODE",
      value: profileUrl(card.slug, "qr"),
      alternateText: prettyProfileUrl(card.slug),
    },
    textModulesData,
    linksModuleData: { uris },
  };
}

async function signingKey(config: GoogleWalletConfig) {
  return importPKCS8(config.privateKey, "RS256");
}

/** "Add to Google Wallet" URL. */
export async function createGoogleSaveUrl(config: GoogleWalletConfig, input: GooglePassInput): Promise<string> {
  const jwt = await new SignJWT({
    typ: "savetopay",
    origins: [getSiteUrl()],
    payload: {
      genericClasses: [buildGenericClass(config)],
      genericObjects: [buildGenericObject(config, input)],
    },
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(config.serviceAccountEmail)
    .setAudience("google")
    .setIssuedAt()
    .sign(await signingKey(config));

  return `${SAVE_URL}${jwt}`;
}

async function getAccessToken(config: GoogleWalletConfig): Promise<string> {
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(config.serviceAccountEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(await signingKey(config));

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google token exchange returned no token");
  return json.access_token;
}

export type GoogleSyncResult = "updated" | "not_saved" | "failed";

/** Pushes the latest card data to an already-saved Google Wallet object. */
export async function syncGoogleObject(config: GoogleWalletConfig, input: GooglePassInput): Promise<GoogleSyncResult> {
  try {
    const token = await getAccessToken(config);
    const object = buildGenericObject(config, input);
    const response = await fetch(`${API_BASE}/genericObject/${encodeURIComponent(object.id)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(object),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return "not_saved";
    if (!response.ok) {
      log.warn("Google Wallet object update failed", { status: response.status });
      return "failed";
    }
    return "updated";
  } catch (error) {
    log.warn("Google Wallet sync error", {}, error);
    return "failed";
  }
}
