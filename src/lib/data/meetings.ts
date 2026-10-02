import "server-only";
import type { VisitSource } from "@/lib/env";
import { log } from "@/lib/log";
import type { Meeting, MeetingOwner } from "@/lib/meetings/model";
import type { ValidMeetingRequest } from "@/lib/meetings/schema";
import type { MeetingPatch } from "@/lib/meetings/state";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { MeetingRequestRow } from "@/lib/supabase/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { getOwnerEmail } from "./contact-requests";
import { isUuid } from "./wallet";

/** Postgres / PostgREST codes for "that table or function doesn't exist" (migration pending). */
const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);
const COLUMNS =
  "id, profile_id, status, proposed_by, slots, confirmed_start, duration_minutes, format, location, time_zone, topic, guest_name, guest_email, guest_phone, guest_company, response_note, closed_by, sequence, source, created_at, updated_at";
const MAX_LISTED = 200;

export function rowToMeeting(row: MeetingRequestRow): Meeting {
  return {
    id: row.id,
    status: row.status,
    proposedBy: row.proposed_by,
    // Postgres may answer with "+00:00" offsets: keep one canonical form everywhere.
    slots: row.slots.map((slot) => new Date(slot).toISOString()),
    confirmedStart: row.confirmed_start ? new Date(row.confirmed_start).toISOString() : null,
    durationMinutes: row.duration_minutes,
    sequence: row.sequence,
    format: row.format,
    location: row.location,
    timeZone: row.time_zone,
    topic: row.topic,
    guest: { name: row.guest_name, email: row.guest_email, phone: row.guest_phone, company: row.guest_company },
    responseNote: row.response_note,
    closedBy: row.closed_by,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type SubmitMeetingResult =
  | { ok: true; id: string; ownerId: string }
  | { ok: false; reason: "closed" | "full" | "unavailable" };

/** Stores a visitor's proposal for a card that takes them (validated by the caller). */
export async function submitMeetingRequest(
  slug: string,
  request: ValidMeetingRequest,
  source: VisitSource,
): Promise<SubmitMeetingResult> {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data, error } = await admin.rpc("submit_meeting_request", {
    p_slug: slug,
    p_guest_name: request.name,
    p_guest_email: request.email,
    p_guest_phone: request.phone,
    p_guest_company: request.company,
    p_topic: request.topic,
    p_format: request.format,
    p_location: request.location,
    p_duration_minutes: request.duration,
    p_time_zone: request.timeZone,
    p_slots: request.slots,
    p_source: source,
  });
  if (error) {
    log.error("submit_meeting_request failed", { slug }, error);
    return { ok: false, reason: "unavailable" };
  }
  const result = data as { id?: unknown; owner_id?: unknown; full?: unknown } | null;
  if (result?.full === true) return { ok: false, reason: "full" };
  if (typeof result?.id === "string" && typeof result.owner_id === "string") {
    return { ok: true, id: result.id, ownerId: result.owner_id };
  }
  return { ok: false, reason: "closed" };
}

export interface MeetingRecord {
  meeting: Meeting;
  owner: MeetingOwner;
}

/** A meeting with its card's owner (server only: the signed link was checked by the caller). */
export async function getMeetingRecord(id: string): Promise<MeetingRecord | null> {
  if (!isUuid(id)) return null;
  const admin = createAdminSupabase();
  if (!admin) return null;
  const { data, error } = await admin.from("meeting_requests").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    if (!MISSING_RELATION_CODES.has(error.code ?? "")) log.warn("meeting lookup failed", { id }, error);
    return null;
  }
  if (!data) return null;
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, slug, full_name")
    .eq("id", data.profile_id)
    .maybeSingle();
  if (profileError || !profile) {
    if (profileError) log.warn("meeting owner lookup failed", { id }, profileError);
    return null;
  }
  return {
    meeting: rowToMeeting(data as MeetingRequestRow),
    owner: { id: profile.id, slug: profile.slug, name: profile.full_name, email: null },
  };
}

/** The owner's login email (needed for invitations), looked up only when an email goes out. */
export async function withOwnerEmail(owner: MeetingOwner): Promise<MeetingOwner> {
  return owner.email ? owner : { ...owner, email: await getOwnerEmail(owner.id) };
}

/**
 * Applies a change only if nobody changed the meeting meanwhile (the sequence
 * is the version): two taps on two devices can't both win.
 */
export async function updateMeeting(id: string, expectedSequence: number, patch: MeetingPatch): Promise<Meeting | null> {
  const admin = createAdminSupabase();
  if (!admin || !isUuid(id)) return null;
  const { data, error } = await admin
    .from("meeting_requests")
    .update(patch)
    .eq("id", id)
    .eq("sequence", expectedSequence)
    .select(COLUMNS)
    .maybeSingle();
  if (error) {
    log.error("meeting update failed", { id }, error);
    return null;
  }
  return data ? rowToMeeting(data as MeetingRequestRow) : null;
}

export interface OwnMeetings {
  /** False until migration 20261002120000 is applied. */
  available: boolean;
  meetings: Meeting[];
}

/** The signed-in owner's meetings, newest first (RLS limits them to their own card). */
export async function listOwnMeetings(supabase: TypedSupabaseClient): Promise<OwnMeetings> {
  const { data, error } = await supabase
    .from("meeting_requests")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(MAX_LISTED);
  if (error) {
    const missing = MISSING_RELATION_CODES.has(error.code ?? "");
    if (!missing) log.warn("meetings list failed", {}, error);
    return { available: !missing, meetings: [] };
  }
  return { available: true, meetings: (data as MeetingRequestRow[]).map(rowToMeeting) };
}

export type DeleteMeetingResult = { ok: true } | { ok: false; reason: "upcoming" | "failed" };

/**
 * Removes a meeting from the owner's list (RLS: their own only). A confirmed
 * meeting that hasn't started must be cancelled instead, so the guest hears.
 */
export async function deleteOwnMeeting(supabase: TypedSupabaseClient, id: string, now: Date = new Date()): Promise<DeleteMeetingResult> {
  if (!isUuid(id)) return { ok: false, reason: "failed" };
  const { data, error: readError } = await supabase.from("meeting_requests").select("status, confirmed_start").eq("id", id).maybeSingle();
  if (readError) {
    log.warn("meeting lookup before delete failed", {}, readError);
    return { ok: false, reason: "failed" };
  }
  if (data?.status === "confirmed" && data.confirmed_start && new Date(data.confirmed_start).getTime() > now.getTime()) {
    return { ok: false, reason: "upcoming" };
  }
  const { error } = await supabase.from("meeting_requests").delete().eq("id", id);
  if (error) log.warn("meeting delete failed", {}, error);
  return error ? { ok: false, reason: "failed" } : { ok: true };
}
