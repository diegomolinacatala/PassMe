"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { credentialsMatch, getAdminCredentials } from "@/lib/admin/auth";
import { endAdminSession, startAdminSession } from "@/lib/admin/session";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { log } from "@/lib/log";
import { clientRateKey } from "@/lib/request";

export interface AdminLoginState {
  username?: string;
  error?: string;
}

/*
 * Per client, plus a global cap so guessing from many addresses stays slow too.
 * The global one is generous: anyone can spend it, and spending it locks the
 * owner out. With a 16+ character password, 150 guesses an hour get nowhere.
 */
const ipLimiter = createSharedRateLimiter({ name: "admin-login-ip", limit: 5, windowMs: 15 * 60_000 });
const globalLimiter = createSharedRateLimiter({ name: "admin-login", limit: 150, windowMs: 60 * 60_000 });

const WRONG = "Usuario o contraseña incorrectos.";
const TOO_MANY = "Demasiados intentos. Espera 15 minutos.";
const OFF = "El panel no está activado.";

export async function adminLoginAction(_prev: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  const credentials = getAdminCredentials();
  if (!credentials) return { error: OFF };

  const username = String(formData.get("username") ?? "").slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 500);

  const key = clientRateKey(await headers());
  if (!(await ipLimiter.check(key)).ok || !(await globalLimiter.check("all")).ok) {
    return { username, error: TOO_MANY };
  }
  if (!credentialsMatch(credentials, username, password)) {
    // A short hash, not the IP: enough to tell an attack (many tries, one client) from a typo.
    log.warn("admin login failed", { client: createHash("sha256").update(key).digest("hex").slice(0, 10) });
    return { username, error: WRONG };
  }

  await startAdminSession(credentials);
  redirect("/admin");
}

export async function adminLogoutAction(): Promise<void> {
  await endAdminSession();
  redirect("/admin/entrar");
}
