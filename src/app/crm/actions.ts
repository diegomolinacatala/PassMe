"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { credentialsMatch, getAdminCredentials } from "@/lib/admin/auth";
import { CRM_LOGIN_PATH, CRM_PATH, endAdminSession, startAdminSession } from "@/lib/admin/session";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { log } from "@/lib/log";
import { clientRateKey } from "@/lib/request";

export interface AdminLoginState {
  username?: string;
  error?: string;
}

/*
 * Per client, plus a global cap so guessing from many addresses stays slow too.
 * The global one is very generous: anyone can spend it, and spending it locks
 * the owner out. A 16+ character password isn't going to fall to 1000 guesses
 * an hour; the per-client limit does the real work.
 *
 * Both fail closed: if the shared counters can't be reached, nobody gets to
 * try passwords (per-instance memory would let a flood spread over instances).
 */
const ipLimiter = createSharedRateLimiter({ name: "admin-login-ip", limit: 5, windowMs: 15 * 60_000, failClosed: true });
const globalLimiter = createSharedRateLimiter({ name: "admin-login", limit: 1000, windowMs: 60 * 60_000, failClosed: true });

const WRONG = "Usuario o contraseña incorrectos.";
const TOO_MANY = "Demasiados intentos. Espera 15 minutos.";
const UNAVAILABLE = "No podemos comprobar tus datos ahora mismo. Inténtalo en unos minutos.";
const OFF = "El CRM no está activado.";

export async function adminLoginAction(_prev: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  const credentials = getAdminCredentials();
  if (!credentials) return { error: OFF };

  const username = String(formData.get("username") ?? "").slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 500);

  const key = clientRateKey(await headers());
  const perClient = await ipLimiter.check(key);
  if (!perClient.ok) return { username, error: perClient.degraded ? UNAVAILABLE : TOO_MANY };
  const overall = await globalLimiter.check("all");
  if (!overall.ok) return { username, error: overall.degraded ? UNAVAILABLE : TOO_MANY };
  if (!credentialsMatch(credentials, username, password)) {
    // A short hash, not the IP: enough to tell an attack (many tries, one client) from a typo.
    log.warn("admin login failed", { client: createHash("sha256").update(key).digest("hex").slice(0, 10) });
    return { username, error: WRONG };
  }

  await startAdminSession(credentials);
  redirect(CRM_PATH);
}

export async function adminLogoutAction(): Promise<void> {
  await endAdminSession();
  redirect(CRM_LOGIN_PATH);
}
