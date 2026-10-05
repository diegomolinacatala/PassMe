import { NextResponse, type NextRequest } from "next/server";
import { parseSignOutScope } from "@/lib/auth/signout";
import { createServerSupabase } from "@/lib/supabase/server";

/** The form's `scope` field: "global" signs out every device; anything else, only this one. */
async function requestedScope(request: NextRequest) {
  try {
    return parseSignOutScope((await request.formData()).get("scope"));
  } catch {
    // No form body (or not a form): the safe default.
    return parseSignOutScope(null);
  }
}

/** POST-only so a stray <img src="/auth/signout"> can't log people out. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut({ scope: await requestedScope(request) });
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}
