import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/config.server";
import { getSupabasePublicConfig } from "@/lib/env";
import type { TypedSupabaseClient } from "./server";
import type { Database } from "./database.types";

/**
 * Privileged client (bypasses RLS). Only for trusted server code paths:
 * analytics inserts, the Apple Wallet web service and account deletion.
 * Returns null when the secret key is not configured.
 */
export function createAdminSupabase(): TypedSupabaseClient | null {
  const config = getSupabasePublicConfig();
  const secret = getSupabaseSecretKey();
  if (!config || !secret) return null;

  return createClient<Database>(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
