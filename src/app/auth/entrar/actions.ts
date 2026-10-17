"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isEmailLinkType, isTokenHash } from "@/lib/auth/email-link";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { log } from "@/lib/log";
import { clientRateKey, safeNextPath } from "@/lib/request";
import { createServerSupabase } from "@/lib/supabase/server";

/*
 * The button's token is a hash Supabase derives from the email and the typed
 * code, so this action must not be an unthrottled way to try codes that the
 * per-email lockout (login/actions.ts) never sees. A person taps once.
 */
const confirmLimiter = createSharedRateLimiter({ name: "login-confirm-ip", limit: 20, windowMs: 10 * 60_000 });

/** The email button's sign-in, run only when the person taps "Entrar" (see /auth/confirm). */
export async function confirmEmailLinkAction(formData: FormData): Promise<void> {
  const tokenHash = formData.get("token_hash");
  const type = formData.get("type");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (!isTokenHash(tokenHash) || !isEmailLinkType(type)) redirect("/login?error=link");

  const supabase = await createServerSupabase();
  if (!supabase) redirect("/login?error=config");
  if (!(await confirmLimiter.check(clientRateKey(await headers()))).ok) redirect("/login?error=link");

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    log.warn("verifyOtp(token_hash) failed", { type }, error);
    redirect("/login?error=link");
  }
  redirect(next);
}
