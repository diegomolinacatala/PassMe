import "server-only";
import type { ContactRequest, ValidContactRequest } from "@/lib/card/contact";
import type { VisitSource } from "@/lib/env";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { ContactRequestRow } from "@/lib/supabase/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "./wallet";

/** Postgres / PostgREST codes for "that table or function doesn't exist" (migration pending). */
const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);
const MAX_LISTED = 1000; // same cap as submit_contact_request keeps per card

export type SubmitContactResult = { ok: true; ownerId: string } | { ok: false; reason: "closed" | "unavailable" };

/** Stores a visitor's details for a card that accepts them (validated by the caller). */
export async function submitContactRequest(
  slug: string,
  request: ValidContactRequest,
  source: VisitSource,
): Promise<SubmitContactResult> {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data, error } = await admin.rpc("submit_contact_request", {
    p_slug: slug,
    p_name: request.name,
    p_email: request.email,
    p_phone: request.phone,
    p_company: request.company,
    p_message: request.message,
    p_source: source,
  });
  if (error) {
    log.error("submit_contact_request failed", { slug }, error);
    return { ok: false, reason: "unavailable" };
  }
  return typeof data === "string" && data ? { ok: true, ownerId: data } : { ok: false, reason: "closed" };
}

function rowToContactRequest(row: ContactRequestRow): ContactRequest {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    message: row.message,
    source: row.source,
    createdAt: row.created_at,
  };
}

export interface OwnContactRequests {
  /** False until migration 20260929130000 is applied. */
  available: boolean;
  requests: ContactRequest[];
  /**
   * Set when the database failed for any other reason: `requests` is empty because
   * we couldn't read them, NOT because there are none. Callers must not show the
   * empty state (or export an empty file) in that case.
   */
  failed?: true;
}

/** The signed-in owner's requests, newest first (RLS limits them to their own card). */
export async function listOwnContactRequests(supabase: TypedSupabaseClient): Promise<OwnContactRequests> {
  const { data, error } = await supabase
    .from("contact_requests")
    .select("id, profile_id, name, email, phone, company, message, source, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_LISTED);
  if (error) {
    if (MISSING_RELATION_CODES.has(error.code ?? "")) return { available: false, requests: [] };
    log.error("contact requests list failed", {}, error);
    return { available: true, requests: [], failed: true };
  }
  return { available: true, requests: data.map(rowToContactRequest) };
}

/**
 * True only when a row was really removed: with row-level security, deleting
 * something that isn't yours (or is already gone) is not an error, it just
 * matches nothing.
 */
export async function deleteContactRequest(supabase: TypedSupabaseClient, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data, error } = await supabase.from("contact_requests").delete().eq("id", id).select("id");
  if (error) {
    log.warn("contact request delete failed", {}, error);
    return false;
  }
  if (!data || data.length === 0) {
    log.warn("contact request delete matched no row", {});
    return false;
  }
  return true;
}

/** Owner's login email, for the "someone left you their contact" notification. */
export async function getOwnerEmail(profileId: string): Promise<string | null> {
  const admin = createAdminSupabase();
  if (!admin) return null;
  const { data, error } = await admin.auth.admin.getUserById(profileId);
  if (error) {
    log.warn("owner email lookup failed", { profileId }, error);
    return null;
  }
  return data.user?.email ?? null;
}
