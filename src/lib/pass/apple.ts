import "server-only";
import { PKPass } from "passkit-generator";
import { cardPalette, toRgbString } from "@/lib/card/colors";
import { resolveDesign } from "@/lib/card/design";
import { isWebLink, linkDisplay, linkHref, linkTitle } from "@/lib/card/links";
import type { PublicCard } from "@/lib/card/types";
import type { AppleWalletConfig } from "@/lib/config.server";
import { getSiteUrl, prettyProfileUrl, profileUrl } from "@/lib/env";
import { stripImages } from "./art";
import { brandIconImages, logoImages } from "./images";

/**
 * Apple Wallet "store card" pass for a contact card.
 *
 * Store cards are the only pass style with a full-width strip image, which is
 * where the card's artwork lives (see lib/pass/art.tsx): generative pattern,
 * avatar seal and the name set in our display serif.
 *
 * Front: logo + company, artwork strip, role/location/pronouns, and a QR that
 * opens the public card. Back: every visible link (tappable) plus the card URL.
 */

export interface ApplePassInput {
  card: PublicCard;
  serialNumber: string;
  /** Present when the web service is enabled, so Wallet can fetch updates. */
  authenticationToken?: string;
  avatar?: Buffer | null;
}

interface PassField {
  key: string;
  label?: string;
  value: string;
  attributedValue?: string;
}

const MAX_BACK_LINKS = 20;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function anchor(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
}

function backFields(card: PublicCard): PassField[] {
  const url = profileUrl(card.slug);
  const fields: PassField[] = [
    { key: "card", label: "Tarjeta online", value: url, attributedValue: anchor(url, prettyProfileUrl(card.slug)) },
  ];

  card.links.slice(0, MAX_BACK_LINKS).forEach((link, index) => {
    const display = linkDisplay(link.kind, link.value);
    const href = linkHref(link.kind, link.value);
    fields.push({
      key: `link_${index}`,
      label: linkTitle(link),
      // Emails and phone numbers are auto-detected by Wallet; URLs get an explicit anchor.
      value: isWebLink(link.kind) ? href : display,
      ...(isWebLink(link.kind) ? { attributedValue: anchor(href, display) } : {}),
    });
  });

  if (card.bio) fields.push({ key: "bio", label: "Sobre mí", value: card.bio });
  fields.push({
    key: "passme",
    label: "Hecho con PassMe",
    value: getSiteUrl(),
    attributedValue: anchor(getSiteUrl(), "Crea tu tarjeta gratis"),
  });
  return fields;
}

/** Pure pass.json builder (no signing) — unit tested. */
export function buildApplePassJson(input: ApplePassInput, config: Pick<AppleWalletConfig, "passTypeId" | "teamId" | "webServiceEnabled">) {
  const { card } = input;
  const design = resolveDesign(card);
  const palette = cardPalette(design.background, design.detail);
  const qrUrl = profileUrl(card.slug, "qr");

  // Store cards show up to four secondary + auxiliary fields in one row under the strip.
  const secondaryFields: PassField[] = [];
  if (card.headline) secondaryFields.push({ key: "headline", label: "CARGO", value: card.headline });
  if (card.location) secondaryFields.push({ key: "location", label: "UBICACIÓN", value: card.location });

  const auxiliaryFields: PassField[] = card.pronouns
    ? [{ key: "pronouns", label: "PRONOMBRES", value: card.pronouns }]
    : [];

  const webService =
    config.webServiceEnabled && input.authenticationToken
      ? { webServiceURL: `${getSiteUrl()}/api/wallet`, authenticationToken: input.authenticationToken }
      : {};

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    serialNumber: input.serialNumber,
    organizationName: "PassMe",
    description: `Tarjeta de contacto de ${card.fullName}`,
    logoText: card.company || "PassMe",
    backgroundColor: toRgbString(palette.background),
    foregroundColor: toRgbString(palette.foreground),
    labelColor: toRgbString(palette.label),
    sharingProhibited: false,
    storeCard: {
      // The name is set in the strip artwork; VoiceOver reads it from `description`.
      primaryFields: [],
      secondaryFields,
      auxiliaryFields,
      backFields: backFields(card),
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: qrUrl,
        messageEncoding: "iso-8859-1",
        altText: prettyProfileUrl(card.slug),
      },
    ],
    ...webService,
  };
}

/** Builds and signs the .pkpass archive. */
export async function createApplePass(input: ApplePassInput, config: AppleWalletConfig): Promise<Buffer> {
  const design = resolveDesign(input.card);
  const passJson = buildApplePassJson(input, config);

  const [icons, logos, strips] = await Promise.all([
    brandIconImages(),
    // The mark takes the label color: the card's detail ink whenever it reads well.
    logoImages(design.label, design.background),
    stripImages(input.card, input.avatar ?? null),
  ]);

  const pass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(passJson)),
      ...icons,
      ...logos,
      ...strips,
    },
    {
      wwdr: config.wwdr,
      signerCert: config.signerCert,
      signerKey: config.signerKey,
      signerKeyPassphrase: config.signerKeyPassphrase,
    },
  );

  return pass.getAsBuffer();
}

export const PKPASS_CONTENT_TYPE = "application/vnd.apple.pkpass";
