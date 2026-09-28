import { createHash, generateKeyPairSync } from "node:crypto";
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from "jose";
import JSZip from "jszip";
import forge from "node-forge";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cardPalette, toRgbString } from "@/lib/card/colors";
import { DEMO_CARD } from "@/lib/card/demo";
import type { AppleWalletConfig, GoogleWalletConfig } from "@/lib/config.server";
import { toPublicCard } from "@/lib/data/cards";
import { buildApplePassJson, createApplePass } from "@/lib/pass/apple";
import { buildGenericObject, createGoogleSaveUrl, googleObjectId } from "@/lib/pass/google";
import { createTestCerts, type TestCerts } from "./helpers/test-certs";

const SITE = "https://passme.test";

let certs: TestCerts;
let appleConfig: AppleWalletConfig;

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  certs = createTestCerts();
  appleConfig = {
    passTypeId: "pass.app.passme.test",
    teamId: "TEAMID1234",
    signerCert: certs.signerCert,
    signerKey: certs.signerKey,
    wwdr: certs.wwdr,
    webServiceEnabled: true,
    apnsHost: "https://api.sandbox.push.apple.com",
  };
}, 60_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
});

const card = toPublicCard(DEMO_CARD);

describe("buildApplePassJson", () => {
  it("builds a store card with a QR pointing at the public card", () => {
    const json = buildApplePassJson({ card, serialNumber: DEMO_CARD.id, authenticationToken: "a".repeat(64) }, appleConfig);

    expect(json).toMatchObject({
      formatVersion: 1,
      passTypeIdentifier: "pass.app.passme.test",
      teamIdentifier: "TEAMID1234",
      serialNumber: DEMO_CARD.id,
      logoText: "Estudio Norte",
      description: "Tarjeta de contacto de Alex Rivera",
      backgroundColor: "rgb(239, 122, 74)",
      // Café ink on the Naranja theme; labels are a softened ink (the pastel detail is too light).
      foregroundColor: "rgb(34, 27, 23)",
      labelColor: toRgbString(cardPalette("#EF7A4A", "#FFE3D1").label),
      webServiceURL: `${SITE}/api/wallet`,
      authenticationToken: "a".repeat(64),
    });
    expect(json.barcodes[0]).toEqual({
      format: "PKBarcodeFormatQR",
      message: `${SITE}/u/demo?src=qr`,
      messageEncoding: "iso-8859-1",
      altText: "passme.test/u/demo",
    });
    expect(json).not.toHaveProperty("generic");
    // The name lives in the strip artwork; fields below it carry role and place.
    expect(json.storeCard.primaryFields).toEqual([]);
    expect(json.storeCard.secondaryFields).toEqual([
      { key: "headline", label: "CARGO", value: "Product Designer" },
      { key: "location", label: "UBICACIÓN", value: "Valencia, ES" },
    ]);
  });

  it("only includes visible links on the back and escapes HTML", () => {
    const json = buildApplePassJson(
      {
        card: {
          ...card,
          links: [...card.links, { id: "xss-link", kind: "custom", value: "https://example.com/?q=<b>", label: "<script>", visible: true }],
        },
        serialNumber: DEMO_CARD.id,
      },
      appleConfig,
    );
    const back = JSON.stringify(json.storeCard.backFields);
    expect(back).not.toContain("600 000 000");
    expect(back).toContain("alex@example.com");
    // Labels are plain text in Wallet; only attributedValue is parsed as (tiny) HTML.
    const attributed = json.storeCard.backFields.map((f) => ("attributedValue" in f ? f.attributedValue : "")).join();
    expect(attributed).not.toContain("<b>");
    expect(attributed).toContain("&lt;b&gt;");
  });

  it("omits the web service without a token or when disabled", () => {
    expect(buildApplePassJson({ card, serialNumber: "x" }, appleConfig)).not.toHaveProperty("webServiceURL");
    expect(
      buildApplePassJson({ card, serialNumber: "x", authenticationToken: "t".repeat(64) }, { ...appleConfig, webServiceEnabled: false }),
    ).not.toHaveProperty("webServiceURL");
  });

  it("keeps field keys unique", () => {
    const json = buildApplePassJson({ card, serialNumber: "x" }, appleConfig);
    const keys = Object.values(json.storeCard).flat().map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("createApplePass", () => {
  it("produces a signed .pkpass with manifest, signature and images", async () => {
    const avatar = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 120, b: 40 } },
    })
      .jpeg()
      .toBuffer();

    const buffer = await createApplePass({ card, serialNumber: DEMO_CARD.id, avatar }, appleConfig);
    const zip = await JSZip.loadAsync(buffer);
    const files = Object.keys(zip.files).sort();

    expect(files).toEqual(
      expect.arrayContaining([
        "pass.json",
        "manifest.json",
        "signature",
        "icon.png",
        "icon@2x.png",
        "icon@3x.png",
        "logo.png",
        "logo@2x.png",
        "strip.png",
        "strip@2x.png",
        "strip@3x.png",
      ]),
    );
    expect(files).not.toContain("thumbnail.png");

    // Manifest hashes match every file.
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as Record<string, string>;
    for (const [name, hash] of Object.entries(manifest)) {
      const content = await zip.file(name)!.async("nodebuffer");
      expect(createHash("sha1").update(content).digest("hex"), name).toBe(hash);
    }

    // Signature is a PKCS#7 SignedData carrying the signer + WWDR certificates.
    const signature = await zip.file("signature")!.async("nodebuffer");
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(signature.toString("binary"))));
    const subjects = (p7 as unknown as { certificates: forge.pki.Certificate[] }).certificates.map(
      (c) => c.subject.getField("CN").value,
    );
    expect(subjects).toEqual(expect.arrayContaining(["Test WWDR CA", "Pass Type ID: pass.app.passme.test"]));

    // Strip artwork at Apple's store-card size (375×144 pt) for every scale.
    for (const [name, scale] of [["strip.png", 1], ["strip@2x.png", 2], ["strip@3x.png", 3]] as const) {
      const meta = await sharp(await zip.file(name)!.async("nodebuffer")).metadata();
      expect([meta.width, meta.height], name).toEqual([375 * scale, 144 * scale]);
    }

    const passJson = JSON.parse(await zip.file("pass.json")!.async("string"));
    expect(passJson.serialNumber).toBe(DEMO_CARD.id);
  }, 60_000);

  it("works without an avatar", async () => {
    const buffer = await createApplePass({ card: { ...card, avatarUrl: null }, serialNumber: "demo-serial" }, appleConfig);
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.file("strip@3x.png")).not.toBeNull();
    expect(zip.file("icon.png")).not.toBeNull();
  }, 60_000);
});

describe("Google Wallet", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const googleConfig: GoogleWalletConfig = {
    issuerId: "3388000000012345678",
    serviceAccountEmail: "wallet@passme-test.iam.gserviceaccount.com",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    classSuffix: "passme_card_v1",
  };

  it("builds a generic object with only visible links", () => {
    const object = buildGenericObject(googleConfig, { card, profileId: DEMO_CARD.id });
    expect(object.id).toBe(googleObjectId(googleConfig, DEMO_CARD.id));
    expect(object.classId).toBe("3388000000012345678.passme_card_v1");
    expect(object.header.defaultValue.value).toBe("Alex Rivera");
    expect(object.hexBackgroundColor).toBe("#EF7A4A");
    // Text modules keep the ids the v1 class template rows point at.
    expect(object.textModulesData.map((m) => m.id)).toEqual(expect.arrayContaining(["company", "location"]));
    expect(object.heroImage.sourceUri.uri).toMatch(new RegExp(`^${SITE}/u/demo/hero\\?v=[0-9a-z]+$`));
    expect(object.barcode).toEqual({ type: "QR_CODE", value: `${SITE}/u/demo?src=qr`, alternateText: "passme.test/u/demo" });
    expect(object.logo.sourceUri.uri).toBe(`${SITE}/brand/wallet-logo.png`);
    const uris = object.linksModuleData.uris.map((u) => u.uri);
    expect(uris).toContain("mailto:alex@example.com");
    expect(uris.join()).not.toContain("600");
    expect(object.id).toMatch(/^\d+\.[\w.-]+$/);
  });

  it("signs a verifiable save-to-wallet JWT", async () => {
    const url = await createGoogleSaveUrl(googleConfig, { card, profileId: DEMO_CARD.id });
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const jwt = url.split("/").pop()!;

    expect(decodeProtectedHeader(jwt).alg).toBe("RS256");
    const key = await importSPKI(publicKey.export({ type: "spki", format: "pem" }).toString(), "RS256");
    const { payload } = await jwtVerify(jwt, key, { audience: "google", issuer: googleConfig.serviceAccountEmail });
    expect(payload.typ).toBe("savetopay");
    expect(payload.origins).toEqual([SITE]);
    const inner = decodeJwt(jwt).payload as { genericClasses: unknown[]; genericObjects: Array<{ id: string }> };
    expect(inner.genericClasses).toHaveLength(1);
    expect(inner.genericObjects[0].id).toBe(googleObjectId(googleConfig, DEMO_CARD.id));
  });
});
