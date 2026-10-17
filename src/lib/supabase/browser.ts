"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/env";
import { supabaseCookieOptions } from "./cookie-options";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | null = null;

/** Singleton browser client (used for avatar uploads). Null in demo mode. */
export function getBrowserSupabase(): SupabaseClient<Database> | null {
  if (client) return client;
  const config = getSupabasePublicConfig();
  if (!config) return null;
  client = createBrowserClient<Database>(config.url, config.key, { cookieOptions: supabaseCookieOptions() });
  return client;
}
