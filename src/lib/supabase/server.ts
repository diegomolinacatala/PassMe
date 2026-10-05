import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { hasSupabaseAuthCookie } from "@/lib/auth/session-cookie";
import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "./database.types";

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Per-request client bound to the visitor's auth cookies. Returns null in demo
 * mode. Never share an instance across requests.
 */
export async function createServerSupabase(): Promise<TypedSupabaseClient | null> {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Whether this browser carries a Supabase session cookie (no network call).
 * A hint for what to show; use getSessionUser() for anything that matters.
 */
export async function hasSessionCookie(): Promise<boolean> {
  if (!getSupabasePublicConfig()) return false;
  const cookieStore = await cookies();
  return hasSupabaseAuthCookie(cookieStore.getAll().map((cookie) => cookie.name));
}

export interface SessionUser {
  id: string;
  email: string | null;
}

/** Verified user (JWT signature checked via getClaims), or null. */
export async function getSessionUser(supabase: TypedSupabaseClient): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  return { id: data.claims.sub, email };
}
