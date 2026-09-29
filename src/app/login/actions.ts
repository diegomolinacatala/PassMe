"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearOtpFailures, registerOtpAttempt } from "@/lib/data/otp-attempts";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { getSiteUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { clientRateKey, safeNextPath } from "@/lib/request";
import { createServerSupabase } from "@/lib/supabase/server";

export type LoginState =
  | { step: "email"; error?: string; email?: string }
  | { step: "code"; email: string; error?: string; info?: string };

const emailSchema = z.email({ error: "Introduce un email válido." }).max(254);
const codeSchema = z.string().regex(/^\d{6,10}$/, "El código son los números del email.");

/*
 * Shared across instances, per client. There is deliberately no per-recipient
 * limit: anyone could spend it to lock a victim out of logging in. Flooding one
 * inbox is bounded by Supabase instead (one email per address per minute, the
 * project's hourly email cap) and by the optional CAPTCHA.
 */
const emailIpLimiter = createSharedRateLimiter({ name: "login-email-ip", limit: 5, windowMs: 10 * 60_000 });
const verifyLimiter = createSharedRateLimiter({ name: "login-verify-ip", limit: 10, windowMs: 10 * 60_000 });

const NOT_CONFIGURED = "El login aún no está conectado (falta configurar Supabase).";
const LOCKED = "Demasiados códigos incorrectos. Usa el enlace del email o espera 15 minutos.";
const CAPTCHA_FAILED = "Completa la verificación anti-spam e inténtalo de nuevo.";

async function clientKey(): Promise<string> {
  return clientRateKey(await headers());
}

/** Supabase answers 400 "captcha verification process failed" when CAPTCHA protection rejects the token. */
function isCaptchaError(error: { message?: string }): boolean {
  return /captcha/i.test(error.message ?? "");
}

/** Step 1: send a magic link that also contains a one-time code. */
export async function requestLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { step: "email", error: parsed.error.issues[0]?.message };
  const email = parsed.data;

  if (!(await emailIpLimiter.check(await clientKey())).ok) {
    return { step: "email", email, error: "Demasiados intentos. Espera unos minutos." };
  }

  const supabase = await createServerSupabase();
  if (!supabase) return { step: "email", email, error: NOT_CONFIGURED };

  const next = safeNextPath(String(formData.get("next") ?? ""));
  const captchaToken = String(formData.get("captchaToken") ?? "") || undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      captchaToken,
    },
  });

  if (error) {
    if (isCaptchaError(error)) return { step: "email", email, error: CAPTCHA_FAILED };
    log.warn("signInWithOtp failed", { status: error.status }, error);
    const message =
      error.status === 429
        ? "Hemos enviado demasiados emails. Espera un poco e inténtalo de nuevo."
        : "No hemos podido enviar el email. Inténtalo de nuevo.";
    return { step: "email", email, error: message };
  }

  return { step: "code", email, info: "Te hemos enviado un enlace y un código de acceso." };
}

/** Step 2 (optional): type the code instead of clicking the link — handy across devices. */
export async function verifyLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (!emailSchema.safeParse(email).success) return { step: "email", error: "Vuelve a introducir tu email." };
  const parsedCode = codeSchema.safeParse(code);
  if (!parsedCode.success) return { step: "code", email, error: parsedCode.error.issues[0]?.message };

  if (!(await verifyLimiter.check(await clientKey())).ok) {
    return { step: "code", email, error: "Demasiados intentos. Espera unos minutos." };
  }

  const supabase = await createServerSupabase();
  if (!supabase) return { step: "email", email, error: NOT_CONFIGURED };

  // Per-email lockout (shared across instances), counted before checking the
  // code so parallel guesses can't all get through.
  if (!(await registerOtpAttempt(email))) {
    return { step: "code", email, error: LOCKED };
  }

  const { error } = await supabase.auth.verifyOtp({ email, token: parsedCode.data, type: "email" });
  if (error) {
    return { step: "code", email, error: "Código incorrecto o caducado." };
  }

  await clearOtpFailures(email);
  redirect(next);
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createServerSupabase();
  if (!supabase) redirect("/login?error=config");

  const next = safeNextPath(String(formData.get("next") ?? ""));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) {
    log.warn("signInWithOAuth failed", {}, error);
    redirect("/login?error=oauth");
  }
  redirect(data.url);
}
