import forge from "node-forge";

export interface TestCerts {
  wwdr: string;
  signerCert: string;
  signerKey: string;
}

function makeCert(
  subject: forge.pki.CertificateField[],
  issuer: forge.pki.CertificateField[],
  publicKey: forge.pki.PublicKey,
  signingKey: forge.pki.PrivateKey,
  isCa: boolean,
): forge.pki.Certificate {
  const cert = forge.pki.createCertificate();
  cert.publicKey = publicKey;
  cert.serialNumber = `0${forge.util.bytesToHex(forge.random.getBytesSync(8))}`;
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  cert.setSubject(subject);
  cert.setIssuer(issuer);
  cert.setExtensions([{ name: "basicConstraints", cA: isCa }]);
  cert.sign(signingKey, forge.md.sha256.create());
  return cert;
}

/** Self-made CA ("fake WWDR") + pass signer — enough to exercise the signing pipeline. */
export function createTestCerts(): TestCerts {
  const caKeys = forge.pki.rsa.generateKeyPair(2048);
  const signerKeys = forge.pki.rsa.generateKeyPair(2048);
  const caSubject = [{ name: "commonName", value: "Test WWDR CA" }];
  const signerSubject = [
    { name: "commonName", value: "Pass Type ID: pass.app.passme.test" },
    { shortName: "OU", value: "TEAMID1234" },
  ];

  const ca = makeCert(caSubject, caSubject, caKeys.publicKey, caKeys.privateKey, true);
  const signer = makeCert(signerSubject, caSubject, signerKeys.publicKey, caKeys.privateKey, false);

  return {
    wwdr: forge.pki.certificateToPem(ca),
    signerCert: forge.pki.certificateToPem(signer),
    signerKey: forge.pki.privateKeyToPem(signerKeys.privateKey),
  };
}
