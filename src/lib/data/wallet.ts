import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { OwnerCard } from "@/lib/card/types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { rowToOwnerCard } from "./cards";

/**
 * Data access for wallet passes. Everything here runs with the admin client
 * because Apple Wallet devices call us without a user session.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function getCardById(admin: TypedSupabaseClient, profileId: string): Promise<OwnerCard | null> {
  if (!isUuid(profileId)) return null;
  const { data, error } = await admin.from("profiles").select("*").eq("id", profileId).maybeSingle();
  if (error) throw new Error(`getCardById failed: ${error.message}`);
  return data ? rowToOwnerCard(data) : null;
}

/** Returns the per-card Apple auth token, creating it on first use. */
export async function ensureApplePassToken(admin: TypedSupabaseClient, profileId: string): Promise<string> {
  const existing = await admin
    .from("wallet_pass_secrets")
    .select("apple_auth_token")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing.error) throw new Error(`wallet secret lookup failed: ${existing.error.message}`);
  if (existing.data) return existing.data.apple_auth_token;

  const token = randomBytes(32).toString("hex");
  const inserted = await admin
    .from("wallet_pass_secrets")
    .upsert({ profile_id: profileId, apple_auth_token: token }, { onConflict: "profile_id", ignoreDuplicates: true })
    .select("apple_auth_token")
    .maybeSingle();
  if (inserted.error) throw new Error(`wallet secret insert failed: ${inserted.error.message}`);
  if (inserted.data) return inserted.data.apple_auth_token;

  // Lost a race with a parallel request: read the winner's token.
  const again = await admin
    .from("wallet_pass_secrets")
    .select("apple_auth_token")
    .eq("profile_id", profileId)
    .single();
  if (again.error) throw new Error(`wallet secret reread failed: ${again.error.message}`);
  return again.data.apple_auth_token;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Parses "ApplePass <token>". */
export function parseApplePassAuth(header: string | null): string | null {
  const match = header?.match(/^ApplePass\s+([A-Za-z0-9]{16,128})$/);
  return match ? match[1]! : null;
}

export async function verifyApplePassToken(
  admin: TypedSupabaseClient,
  serial: string,
  token: string | null,
): Promise<boolean> {
  if (!token || !isUuid(serial)) return false;
  const { data, error } = await admin
    .from("wallet_pass_secrets")
    .select("apple_auth_token")
    .eq("profile_id", serial)
    .maybeSingle();
  if (error || !data) return false;
  return safeEqual(data.apple_auth_token, token);
}

export interface RegistrationKey {
  deviceLibraryId: string;
  passTypeId: string;
  serial: string;
}

/** Returns true when the registration is new (Apple expects 201 vs 200). */
export async function registerDevice(
  admin: TypedSupabaseClient,
  key: RegistrationKey,
  pushToken: string,
): Promise<boolean> {
  const existing = await admin
    .from("apple_pass_registrations")
    .select("push_token")
    .eq("device_library_id", key.deviceLibraryId)
    .eq("pass_type_id", key.passTypeId)
    .eq("serial_number", key.serial)
    .maybeSingle();
  if (existing.error) throw new Error(`registration lookup failed: ${existing.error.message}`);

  const { error } = await admin.from("apple_pass_registrations").upsert(
    {
      device_library_id: key.deviceLibraryId,
      pass_type_id: key.passTypeId,
      serial_number: key.serial,
      push_token: pushToken,
    },
    { onConflict: "device_library_id,pass_type_id,serial_number" },
  );
  if (error) throw new Error(`registration upsert failed: ${error.message}`);
  return !existing.data;
}

export async function unregisterDevice(admin: TypedSupabaseClient, key: RegistrationKey): Promise<void> {
  const { error } = await admin
    .from("apple_pass_registrations")
    .delete()
    .eq("device_library_id", key.deviceLibraryId)
    .eq("pass_type_id", key.passTypeId)
    .eq("serial_number", key.serial);
  if (error) throw new Error(`unregister failed: ${error.message}`);
}

export interface UpdatedSerials {
  serialNumbers: string[];
  lastUpdated: string;
}

/**
 * Serials registered on a device that changed after `since` (a millisecond
 * timestamp tag we previously returned as lastUpdated).
 */
export async function listUpdatedSerials(
  admin: TypedSupabaseClient,
  deviceLibraryId: string,
  passTypeId: string,
  since: string | null,
): Promise<UpdatedSerials | null> {
  const regs = await admin
    .from("apple_pass_registrations")
    .select("serial_number")
    .eq("device_library_id", deviceLibraryId)
    .eq("pass_type_id", passTypeId);
  if (regs.error) throw new Error(`registrations lookup failed: ${regs.error.message}`);
  const serials = regs.data.map((r) => r.serial_number);
  if (serials.length === 0) return null;

  const profiles = await admin.from("profiles").select("id, updated_at").in("id", serials);
  if (profiles.error) throw new Error(`profiles lookup failed: ${profiles.error.message}`);

  const sinceMs = since && /^\d{1,16}$/.test(since) ? Number(since) : 0;
  const updated = profiles.data.filter((p) => Date.parse(p.updated_at) > sinceMs);
  if (updated.length === 0) return null;

  const lastUpdated = Math.max(...updated.map((p) => Date.parse(p.updated_at)));
  return { serialNumbers: updated.map((p) => p.id), lastUpdated: String(lastUpdated) };
}

export async function getPushTokensForSerial(
  admin: TypedSupabaseClient,
  passTypeId: string,
  serial: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("apple_pass_registrations")
    .select("push_token")
    .eq("pass_type_id", passTypeId)
    .eq("serial_number", serial);
  if (error) throw new Error(`push token lookup failed: ${error.message}`);
  return [...new Set(data.map((r) => r.push_token))];
}

export async function deleteRegistrationsForPushTokens(
  admin: TypedSupabaseClient,
  passTypeId: string,
  pushTokens: string[],
): Promise<void> {
  if (pushTokens.length === 0) return;
  const { error } = await admin
    .from("apple_pass_registrations")
    .delete()
    .eq("pass_type_id", passTypeId)
    .in("push_token", pushTokens);
  if (error) throw new Error(`stale registration cleanup failed: ${error.message}`);
}
