/**
 * `npm run doctor` — checks .env.local (or the current environment) against
 * the real services: Supabase reachability + migration + bucket, Apple
 * certificates (key match, expiry, pass type/team ids) and Google credentials.
 * Prints only booleans and metadata, never secret values.
 */
import { createPrivateKey, X509Certificate } from "node:crypto";
import nextEnv from "@next/env";
import { importPKCS8, SignJWT } from "jose";

nextEnv.loadEnvConfig(process.cwd());
const env = process.env;

let failures = 0;
let warnings = 0;
const ok = (msg: string) => console.info(`  ✔ ${msg}`);
const warn = (msg: string) => {
  warnings += 1;
  console.info(`  ! ${msg}`);
};
const fail = (msg: string) => {
  failures += 1;
  console.info(`  ✖ ${msg}`);
};
const section = (title: string) => console.info(`\n${title}`);

function decodePem(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const v = value.trim();
  if (v.includes("-----BEGIN")) return v.replace(/\\n/g, "\n");
  const decoded = Buffer.from(v, "base64").toString("utf8");
  return decoded.includes("-----BEGIN") ? decoded : null;
}

async function http(url: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    return null;
  }
}

// --- Site --------------------------------------------------------------------
section("Sitio");
const siteUrl = env.NEXT_PUBLIC_SITE_URL;
if (!siteUrl) warn("NEXT_PUBLIC_SITE_URL vacío: se usará http://localhost:3000 (o la URL de Vercel).");
else if (siteUrl.endsWith("/")) fail("NEXT_PUBLIC_SITE_URL no debe acabar en '/'.");
else if (!siteUrl.startsWith("https://")) warn(`${siteUrl} no es https: vale en local, pero no en producción (Apple lo exige).`);
else ok(`URL pública: ${siteUrl}`);

// --- Supabase ----------------------------------------------------------------
section("Supabase");
const sbUrl = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const sbKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sbSecret = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

if (!sbUrl || !sbKey) {
  fail("Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY → la app funcionará en modo demo.");
} else {
  const settings = await http(`${sbUrl}/auth/v1/settings`, { headers: { apikey: sbKey } });
  if (!settings) fail(`No se puede conectar con ${sbUrl}.`);
  else if (!settings.ok) fail(`La clave publishable/anon no es válida (HTTP ${settings.status}).`);
  else {
    ok("Proyecto accesible y clave publishable válida.");
    const json = (await settings.json()) as { external?: Record<string, boolean> };
    if (env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true" && !json.external?.google) {
      fail("NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true pero el proveedor Google no está activo en Supabase Auth.");
    }
  }

  const rpc = await http(`${sbUrl}/rest/v1/rpc/get_public_card`, {
    method: "POST",
    headers: { apikey: sbKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_slug: "doctor-check" }),
  });
  if (rpc?.ok) ok("Migración inicial aplicada (get_public_card existe).");
  else fail("La migración no está aplicada: ejecuta supabase/migrations/*.sql (ver docs/SETUP.md).");

  const redirect = await http(`${sbUrl}/rest/v1/rpc/resolve_slug_redirect`, {
    method: "POST",
    headers: { apikey: sbKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_slug: "doctor-check" }),
  });
  if (redirect?.ok) ok("Migración 20260929120000 aplicada (historial de enlaces, límites compartidos).");
  else fail("Falta la migración 20260929120000_launch_hardening.sql (ver docs/SETUP.md › Migraciones).");

  if (!sbSecret) {
    fail("Falta SUPABASE_SECRET_KEY: sin ella no hay pases, métricas ni borrado de cuentas.");
  } else {
    const adminHeaders = { apikey: sbSecret, Authorization: `Bearer ${sbSecret}` };
    const secrets = await http(`${sbUrl}/rest/v1/wallet_pass_secrets?select=profile_id&limit=1`, { headers: adminHeaders });
    if (secrets?.ok) ok("Clave secreta válida (puede leer tablas protegidas).");
    else fail(`La clave secreta no funciona (HTTP ${secrets?.status ?? "sin respuesta"}).`);

    const typeface = await http(`${sbUrl}/rest/v1/profiles?select=typeface&limit=1`, { headers: adminHeaders });
    if (typeface?.ok) ok("Migración 20260928180000 aplicada (rediseño del pase).");
    else fail("Falta la migración 20260928180000_pass_redesign.sql.");

    const contacts = await http(`${sbUrl}/rest/v1/contact_requests?select=id&limit=1`, { headers: adminHeaders });
    if (contacts?.ok) ok("Migración 20260929130000 aplicada (contactos recibidos).");
    else fail("Falta la migración 20260929130000_contact_requests.sql.");

    const bucket = await http(`${sbUrl}/storage/v1/bucket/avatars`, { headers: adminHeaders });
    if (bucket?.ok) {
      const info = (await bucket.json()) as { public?: boolean };
      if (info.public) ok("Bucket 'avatars' creado y público.");
      else fail("El bucket 'avatars' existe pero no es público.");
    } else fail("No existe el bucket 'avatars' (lo crea la migración).");
  }
}

// --- Signing secret ------------------------------------------------------------
section("Enlaces al móvil");
const signing = env.PASSME_SIGNING_SECRET ?? "";
if (signing.length >= 32) ok("PASSME_SIGNING_SECRET configurado.");
else warn("PASSME_SIGNING_SECRET vacío o < 32 caracteres: el botón «enviar a mi móvil» estará oculto.");

// --- Apple Wallet --------------------------------------------------------------
section("Apple Wallet");
const cert = decodePem(env.APPLE_PASS_CERT);
const key = decodePem(env.APPLE_PASS_KEY);
const wwdr = decodePem(env.APPLE_WWDR_CERT);
if (!env.APPLE_PASS_TYPE_ID && !cert) {
  warn("Sin configurar (opcional hasta tener cuenta de Apple Developer).");
} else {
  if (!env.APPLE_PASS_TYPE_ID?.startsWith("pass.")) fail("APPLE_PASS_TYPE_ID debe empezar por 'pass.'.");
  if (!env.APPLE_TEAM_ID) fail("Falta APPLE_TEAM_ID.");
  if (!cert || !key || !wwdr) fail("Faltan APPLE_PASS_CERT / APPLE_PASS_KEY / APPLE_WWDR_CERT (o no son PEM/base64 válidos).");
  else {
    try {
      const x509 = new X509Certificate(cert);
      const wwdrCert = new X509Certificate(wwdr);
      const privateKey = createPrivateKey({ key, passphrase: env.APPLE_PASS_KEY_PASSPHRASE || undefined });

      if (x509.checkPrivateKey(privateKey)) ok("El certificado corresponde a la clave privada.");
      else fail("APPLE_PASS_CERT no corresponde a APPLE_PASS_KEY.");

      const daysLeft = Math.floor((Date.parse(x509.validTo) - Date.now()) / 86_400_000);
      if (daysLeft < 0) fail(`El certificado caducó el ${x509.validTo}.`);
      else if (daysLeft < 30) warn(`El certificado caduca en ${daysLeft} días (${x509.validTo}).`);
      else ok(`Certificado válido hasta ${x509.validTo}.`);

      const uid = x509.subject.match(/UID=([^\n,]+)/)?.[1];
      const ou = x509.subject.match(/OU=([^\n,]+)/)?.[1];
      if (uid && uid !== env.APPLE_PASS_TYPE_ID) fail(`El certificado es para ${uid}, pero APPLE_PASS_TYPE_ID=${env.APPLE_PASS_TYPE_ID}.`);
      else if (uid) ok(`Pass Type ID coincide (${uid}).`);
      if (ou && ou !== env.APPLE_TEAM_ID) fail(`El certificado es del equipo ${ou}, pero APPLE_TEAM_ID=${env.APPLE_TEAM_ID}.`);

      if (x509.checkIssued(wwdrCert)) ok(`WWDR correcto (${wwdrCert.subject.match(/CN=([^\n,]+)/)?.[1] ?? "?"}).`);
      else fail("APPLE_WWDR_CERT no es el emisor de tu certificado: descarga el WWDR G4 de Apple.");
    } catch (error) {
      fail(`No se pudieron leer los certificados: ${(error as Error).message}`);
    }
  }
  if (env.APPLE_WALLET_WEB_SERVICE !== "false" && !siteUrl?.startsWith("https://")) {
    warn("Actualizaciones push desactivadas hasta que NEXT_PUBLIC_SITE_URL sea https.");
  }
}

// --- Google Wallet ---------------------------------------------------------------
section("Lanzamiento");
if (env.NEXT_PUBLIC_LEGAL_NAME && env.NEXT_PUBLIC_LEGAL_TAX_ID && env.NEXT_PUBLIC_LEGAL_ADDRESS && env.NEXT_PUBLIC_CONTACT_EMAIL) {
  ok("Datos del titular para aviso legal y privacidad.");
} else {
  warn("Faltan NEXT_PUBLIC_LEGAL_NAME / _TAX_ID / _ADDRESS / NEXT_PUBLIC_CONTACT_EMAIL: las páginas legales muestran huecos.");
}
if (env.RESEND_API_KEY && env.PASSME_EMAIL_FROM) ok("Avisos por email (Resend) configurados.");
else warn("Sin RESEND_API_KEY / PASSME_EMAIL_FROM: no se avisará por email de los contactos recibidos (opcional).");
if (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY) ok("CAPTCHA (Cloudflare Turnstile) configurado.");
else if (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) warn("Hay NEXT_PUBLIC_TURNSTILE_SITE_KEY pero falta TURNSTILE_SECRET_KEY (el formulario de contacto no lo verificará).");
else warn("Sin CAPTCHA (opcional, recomendado cuando haya tráfico real).");
if ((env.CRON_SECRET ?? "").length >= 16) ok("CRON_SECRET configurado (limpieza diaria).");
else warn("Sin CRON_SECRET (≥ 16 caracteres): la limpieza diaria de datos caducados no se ejecutará.");

section("Google Wallet");
const saRaw = env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON;
if (!env.GOOGLE_WALLET_ISSUER_ID && !saRaw && !env.GOOGLE_WALLET_PRIVATE_KEY) {
  warn("Sin configurar (opcional).");
} else {
  if (!/^\d+$/.test(env.GOOGLE_WALLET_ISSUER_ID ?? "")) fail("GOOGLE_WALLET_ISSUER_ID debe ser numérico.");
  let email = env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
  let pem = decodePem(env.GOOGLE_WALLET_PRIVATE_KEY);
  if (saRaw) {
    try {
      const text = saRaw.trim().startsWith("{") ? saRaw : Buffer.from(saRaw, "base64").toString("utf8");
      const json = JSON.parse(text) as { client_email?: string; private_key?: string };
      email = json.client_email;
      pem = decodePem(json.private_key);
    } catch {
      fail("GOOGLE_WALLET_SERVICE_ACCOUNT_JSON no es un JSON (ni base64 de un JSON) válido.");
    }
  }
  if (email && pem) {
    try {
      const signingKey = await importPKCS8(pem, "RS256");
      const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/wallet_object.issuer" })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuer(email)
        .setAudience("https://oauth2.googleapis.com/token")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(signingKey);
      const token = await http("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      });
      if (token?.ok) ok(`Cuenta de servicio válida (${email}).`);
      else fail(`Google rechazó la cuenta de servicio (HTTP ${token?.status ?? "sin respuesta"}).`);
    } catch (error) {
      fail(`Clave privada de Google no válida: ${(error as Error).message}`);
    }
  } else if (!saRaw) {
    fail("Faltan credenciales de la cuenta de servicio.");
  }
}

console.info(`\n${failures === 0 ? "Todo listo" : `${failures} problema(s)`}${warnings ? ` · ${warnings} aviso(s)` : ""}.`);
process.exit(failures === 0 ? 0 : 1);
