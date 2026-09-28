import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/log";
import { safeNextPath } from "@/lib/request";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * PKCE callback for OAuth (Google) and default magic links: exchanges the
 * ?code for a session cookie. Works only in the browser that started the flow;
 * /auth/confirm (token_hash) is the cross-device alternative.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createServerSupabase();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, origin));
      log.warn("exchangeCodeForSession failed", {}, error);
    }
  }

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
