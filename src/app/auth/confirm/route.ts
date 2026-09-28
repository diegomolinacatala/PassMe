import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/log";
import { safeNextPath } from "@/lib/request";
import { createServerSupabase } from "@/lib/supabase/server";

const OTP_TYPES: ReadonlySet<string> = new Set(["email", "magiclink", "signup", "invite", "recovery", "email_change"]);

/**
 * Magic-link landing for the custom email template (supabase/templates/*.html):
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
 * Unlike the PKCE callback, this works when the link is opened on another device.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type && OTP_TYPES.has(type)) {
    const supabase = await createServerSupabase();
    if (supabase) {
      const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(new URL(next, origin));
      log.warn("verifyOtp(token_hash) failed", { type }, error);
    }
  }

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
