import "server-only";
import { PKPass } from "passkit-generator";
import { cardPalette, toHex, toRgbString } from "@/lib/card/colors";
import { isWebLink, linkDisplay, linkHref, linkTitle } from "@/lib/card/links";
import type { PublicCard } from "@/lib/card/types";
import type { AppleWalletConfig } from "@/lib/config.server";
import { getSiteUrl, prettyProfileUrl, profileUrl } from "@/lib/env";
import { brandIconImages, logoImages, thumbnailImages } from "./images";

/**
 * Apple Wallet "generic" pass for a contact card.
 *
 * Front: logo + company, name (primary) with headline as label, circular
 * avatar thumbnail, company/location, and a QR that opens the public card.
 * Back: every visible link (tappable) plus the card URL.
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
  const palette = cardPalette(card.accentColor);
  const qrUrl = profileUrl(card.slug, "qr");

  const secondaryFields: PassField[] = [];
  if (card.company) secondaryFields.push({ key: "company", label: "EMPRESA", value: card.company });
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
    generic: {
      primaryFields: [{ key: "name", label: (card.headline || "Contacto").toUpperCase(), value: card.fullName }],
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
  const palette = cardPalette(input.card.accentColor);
  const passJson = buildApplePassJson(input, config);

  const [icons, logos, thumbnails] = await Promise.all([
    brandIconImages(),
    logoImages(toHex(palette.foreground), toHex(palette.background)),
    input.avatar ? thumbnailImages(input.avatar) : Promise.resolve({}),
  ]);

  const pass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(passJson)),
      ...icons,
      ...logos,
      ...thumbnails,
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
