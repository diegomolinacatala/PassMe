import { NextResponse, type NextRequest } from "next/server";
import { parseSignOutScope } from "@/lib/auth/signout";
import { safeNextPath } from "@/lib/request";
import { createServerSupabase } from "@/lib/supabase/server";

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
  const form = await readForm(request);
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut({ scope: parseSignOutScope(form?.get("scope") ?? null) });
  const next = form?.get("next");
  const target = safeNextPath(typeof next === "string" ? next : null, "/");
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), { status: 303 });
}
