"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSiteUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { createRateLimiter } from "@/lib/rate-limit";
import { getClientIp, safeNextPath } from "@/lib/request";
import { createServerSupabase } from "@/lib/supabase/server";

export type LoginState =
  | { step: "email"; error?: string; email?: string }
  | { step: "code"; email: string; error?: string; info?: string };

const emailSchema = z.email({ error: "Introduce un email válido." }).max(254);
const codeSchema = z.string().regex(/^\d{6,10}$/, "El código son los números del email.");

const emailLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });
const verifyLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

const NOT_CONFIGURED = "El login aún no está conectado (falta configurar Supabase).";

async function clientKey(prefix: string): Promise<string> {
  return `${prefix}:${getClientIp(await headers())}`;
}

/** Step 1: send a magic link that also contains a one-time code. */
export async function requestLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { step: "email", error: parsed.error.issues[0]?.message };
  const email = parsed.data;

  if (!emailLimiter.check(await clientKey("otp")).ok) {
    return { step: "email", email, error: "Demasiados intentos. Espera unos minutos." };
  }

  const supabase = await createServerSupabase();
  if (!supabase) return { step: "email", email, error: NOT_CONFIGURED };

  const next = safeNextPath(String(formData.get("next") ?? ""));
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
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

  if (!verifyLimiter.check(await clientKey("verify")).ok) {
    return { step: "code", email, error: "Demasiados intentos. Espera unos minutos." };
  }

  const supabase = await createServerSupabase();
  if (!supabase) return { step: "email", email, error: NOT_CONFIGURED };

  const { error } = await supabase.auth.verifyOtp({ email, token: parsedCode.data, type: "email" });
  if (error) return { step: "code", email, error: "Código incorrecto o caducado." };

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
