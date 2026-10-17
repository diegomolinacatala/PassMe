import { NextResponse, type NextRequest } from "next/server";
import { parseSignOutScope } from "@/lib/auth/signout";
import { log } from "@/lib/log";
import { safeNextPath } from "@/lib/request";
import { createServerSupabase } from "@/lib/supabase/server";

/** Where a failed "sign out everywhere" lands: the editor shows a notice for `?sesion=error`. */
const SIGN_OUT_ERROR_PATH = "/dashboard?sesion=error";

async function readForm(request: NextRequest): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    // No form body (or not a form): the safe defaults.
    return null;
  }
}

/**
 * POST-only so a stray <img src="/auth/signout"> can't log people out. The
 * form's `scope` field: "global" signs out every device; anything else, only
 * this one. `next`: a path on this site to land on (e.g. /login to come back
 * with another email); anything else goes home.
 */
export async function POST(request: NextRequest) {
  // A form on another site can't sign anyone out (the session cookie is SameSite=Lax, but no need to rely on it).
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403 });

  const form = await readForm(request);
  const scope = parseSignOutScope(form?.get("scope") ?? null);
  const supabase = await createServerSupabase();
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope });
    if (error) {
      log.error("signOut failed", { scope }, error);
      // "Everywhere" is a promise: if it couldn't be kept, the editor says so (?sesion=error).
      if (scope === "global") return NextResponse.redirect(new URL(SIGN_OUT_ERROR_PATH, request.nextUrl.origin), { status: 303 });
    }
  }
  const next = form?.get("next");
  const target = safeNextPath(typeof next === "string" ? next : null, "/");
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), { status: 303 });
}
