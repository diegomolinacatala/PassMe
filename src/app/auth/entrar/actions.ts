"use server";

import { redirect } from "next/navigation";
import { isEmailLinkType, isTokenHash } from "@/lib/auth/email-link";
import { log } from "@/lib/log";
import { safeNextPath } from "@/lib/request";
import { createServerSupabase } from "@/lib/supabase/server";

/** The email button's sign-in, run only when the person taps "Entrar" (see /auth/confirm). */
export async function confirmEmailLinkAction(formData: FormData): Promise<void> {
  const tokenHash = formData.get("token_hash");
  const type = formData.get("type");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (!isTokenHash(tokenHash) || !isEmailLinkType(type)) redirect("/login?error=link");

  const supabase = await createServerSupabase();
  if (!supabase) redirect("/login?error=config");

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    log.warn("verifyOtp(token_hash) failed", { type }, error);
    redirect("/login?error=link");
  }
  redirect(next);
}
