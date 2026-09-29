import { NextResponse, type NextRequest } from "next/server";
import { EMAIL_LINK_TYPES } from "@/lib/auth/email-link";

/**
 * Magic-link landing for the custom email template (supabase/templates/*.html):
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
 *
 * It no longer signs in on GET: mail security scanners (Microsoft Defender
 * Safe Links and the like) open every link in an email, and the token behind
 * the button is the same one as the typed code — a scanner would burn both.
 * /auth/entrar asks for one tap and verifies on POST instead. Works on any
 * device, unlike the PKCE callback.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  if (!tokenHash || !type || !EMAIL_LINK_TYPES.has(type)) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  const target = new URL("/auth/entrar", origin);
  target.searchParams.set("token_hash", tokenHash);
  target.searchParams.set("type", type);
  const next = searchParams.get("next");
  if (next) target.searchParams.set("next", next);
  return NextResponse.redirect(target, { status: 303 });
}
