"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cleanCode, DEMO_LOGIN_CODE, RESEND_COOLDOWN_SECONDS, retryAfterSeconds } from "@/lib/auth/code";
import { welcomePath } from "@/lib/card/quick";
import { clearOtpFailures, registerOtpAttempt } from "@/lib/data/otp-attempts";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { getSiteUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { createQuickCard, draftFallbackPath, parseDraftJson, parseOrigin } from "@/lib/onboarding";
import { clientRateKey, safeNextPath } from "@/lib/request";
import { createServerSupabase, getSessionUser, type TypedSupabaseClient } from "@/lib/supabase/server";

export type AuthState =
  | { step: "email"; email?: string; error?: string }
  | {
      step: "code";
      email: string;
      /** Identifies the last email sent: the resend countdown restarts only when it changes. */
      sentAt: number;
      /** Seconds until another email can be requested, counted from when this state arrives. */
      resendIn: number;
      notice?: string;
      error?: string;
      /** The code was wrong or expired: the input clears for another try. */
      rejected?: boolean;
    };

const emailSchema = z.email({ error: "Introduce un email válido." }).max(254);
const codeSchema = z.string().regex(/^\d{6,10}$/, "El código son las cifras que te hemos enviado por email.");

/*
 * Shared across instances, per client. Sized for a room full of people on the
 * same Wi-Fi signing up after a talk, not for one person. There is deliberately
 * no per-recipient limit on sending: anyone could spend it to lock a victim out.
 * Flooding one inbox is bounded by Supabase instead (one email per address per
 * minute, the project's hourly email cap) and by the optional CAPTCHA; guessing
 * codes, by the per-email lockout (otp-attempts.ts).
 */
const emailIpLimiter = createSharedRateLimiter({ name: "login-email-ip", limit: 10, windowMs: 10 * 60_000 });
const verifyLimiter = createSharedRateLimiter({ name: "login-verify-ip", limit: 20, windowMs: 10 * 60_000 });

const LOCKED = "Demasiados códigos incorrectos. Usa el botón del email o espera 15 minutos.";
const CAPTCHA_FAILED = "Completa la verificación anti-spam e inténtalo de nuevo.";
const TOO_MANY = "Demasiados intentos. Espera unos minutos.";

async function clientKey(): Promise<string> {
  return clientRateKey(await headers());
}

/** Supabase answers 400 "captcha verification process failed" when CAPTCHA protection rejects the token. */
function isCaptchaError(error: { message?: string }): boolean {
  return /captcha/i.test(error.message ?? "");
}

function codeSent(email: string, extra: { resendIn?: number; notice?: string } = {}): AuthState {
  return { step: "code", email, sentAt: Date.now(), resendIn: extra.resendIn ?? RESEND_COOLDOWN_SECONDS, notice: extra.notice };
}

/**
 * The login flow as one action (the form says what it wants in `intent`):
 * send a code, send another one, or check the code typed in.
 */
export async function authAction(prev: AuthState, formData: FormData): Promise<AuthState> {
  const intent = String(formData.get("intent") ?? "send");
  if (intent === "verify") return verifyCode(prev, formData);
  return sendCode(formData, intent === "resend" ? prev : null);
}

async function sendCode(formData: FormData, resendFrom: AuthState | null): Promise<AuthState> {
  const raw = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { step: "email", email: raw, error: parsed.error.issues[0]?.message };
  const email = parsed.data;

  // A failed resend keeps the code screen (the previous code may still arrive).
  const fail = (error: string): AuthState =>
    resendFrom?.step === "code" ? { ...resendFrom, error, notice: undefined, rejected: false } : { step: "email", email, error };

  const supabase = await createServerSupabase();
  // Demo mode sends nothing, so there's nothing to rate-limit either.
  if (!supabase) {
    return codeSent(email, { notice: `Modo demo: no enviamos emails. El código es ${DEMO_LOGIN_CODE}.` });
  }
  if (!(await emailIpLimiter.check(await clientKey())).ok) return fail(TOO_MANY);

  const captchaToken = String(formData.get("captchaToken") ?? "") || undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(safeNextPath(String(formData.get("next") ?? "")))}`,
      captchaToken,
    },
  });

  if (error) {
    if (isCaptchaError(error)) return fail(CAPTCHA_FAILED);
    const wait = retryAfterSeconds(error.message);
    if (error.status === 429 && wait !== null) {
      // An email went out moments ago (a double tap, another tab…): that code still works.
      return codeSent(email, { resendIn: wait, notice: "Ya te enviamos un código hace un momento: usa ese." });
    }
    log.warn("signInWithOtp failed", { status: error.status, code: error.code }, error);
    return fail(
      error.status === 429
        ? "Hemos enviado demasiados emails. Espera un poco e inténtalo de nuevo."
        : "No hemos podido enviar el email. Inténtalo de nuevo.",
    );
  }

  return codeSent(email, resendFrom ? { notice: "Te hemos enviado otro código. Usa el del último email." } : {});
}

async function verifyCode(prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) return { step: "email", error: "Vuelve a introducir tu email." };

  const base: Extract<AuthState, { step: "code" }> =
    prev.step === "code" && prev.email === email ? prev : { step: "code", email, sentAt: 0, resendIn: 0 };
  const fail = (error: string, rejected = false): AuthState => ({ ...base, error, notice: undefined, rejected });

  const parsedCode = codeSchema.safeParse(cleanCode(String(formData.get("code") ?? "")));
  if (!parsedCode.success) return fail(parsedCode.error.issues[0]?.message ?? "Código no válido.");

  const supabase = await createServerSupabase();
  if (!supabase) {
    if (parsedCode.data !== DEMO_LOGIN_CODE) return fail("Código incorrecto o caducado.", true);
    return finishSignIn(null, null, formData);
  }
  if (!(await verifyLimiter.check(await clientKey())).ok) return fail(TOO_MANY);

  // Per-email lockout (shared across instances), counted before checking the
  // code so parallel guesses can't all get through.
  const client = await clientKey();
  if (!(await registerOtpAttempt(email, client))) return fail(LOCKED);

  const { data, error } = await supabase.auth.verifyOtp({ email, token: parsedCode.data, type: "email" });
  if (error || !data.user) return fail("Código incorrecto o caducado.", true);

  await clearOtpFailures(email, client);
  return finishSignIn(supabase, data.user.id, formData);
}

/**
 * Signed in: from /crear the card is created right away (same request, the
 * client already carries the new session); from /login, on to `next`.
 */
async function finishSignIn(supabase: TypedSupabaseClient | null, userId: string | null, formData: FormData): Promise<never> {
  if (!formData.has("draft")) redirect(safeNextPath(String(formData.get("next") ?? "")));

  const origin = parseOrigin(formData.get("from"), formData.get("via"));
  const draft = parseDraftJson(formData.get("draft"));
  if (draft === null) redirect(draftFallbackPath(origin));
  // Demo mode: there is nowhere to store the card, so just show the welcome screen.
  if (!supabase || !userId) redirect(welcomePath(origin.from, origin.via));

  const outcome = await createQuickCard(supabase, userId, draft, origin);
  if (!outcome.ok) log.warn("quick card after sign-in failed", { error: outcome.error });
  // If the draft couldn't be used, /crear shows it again (the browser still has it).
  redirect(outcome.ok ? outcome.redirectTo : draftFallbackPath(origin));
}

/** Lets a tab waiting for the code notice that the email's button signed this browser in. */
export async function checkSignedInAction(): Promise<boolean> {
  const supabase = await createServerSupabase();
  if (!supabase) return false;
  return (await getSessionUser(supabase)) !== null;
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
