import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { fakeSupabase, first, type Handler, type RecordedQuery } from "./fake-supabase";

/** One meeting, its owner, a counting rate limiter and the owner's login email, behind a fake admin client. */

export const OWNER_ID = "11111111-1111-4111-8111-111111111111";
export const MEETING_ID = "33333333-3333-4333-8333-333333333333";

export function meetingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MEETING_ID,
    profile_id: OWNER_ID,
    status: "pending",
    proposed_by: "guest",
    slots: ["2099-10-06 08:00:00+00", "2099-10-06T10:00:00+00:00"],
    confirmed_start: null,
    duration_minutes: 30,
    format: "in_person",
    location: "Café Central",
    time_zone: "Europe/Madrid",
    topic: "Un café",
    guest_name: "Marta Gil",
    guest_email: "marta@example.com",
    guest_phone: null,
    guest_company: "Mirador",
    response_note: "",
    closed_by: null,
    sequence: 0,
    source: "qr",
    created_at: "2026-10-02T08:00:00Z",
    updated_at: "2026-10-02T08:00:00Z",
    ...overrides,
  };
}

export interface FakeMeetingsOptions {
  row: Record<string, unknown>;
  /** What an update returns: the patched row, or nothing when someone got there first. */
  raced?: boolean;
  /** Result of submit_meeting_request. */
  submit?: unknown;
  /** Updates answer with the patched row but leave the stored one as it was (to repeat an answer). */
  frozen?: boolean;
}

export function fakeMeetingsAdmin(options: FakeMeetingsOptions) {
  const updates: Array<Record<string, unknown>> = [];
  const hits = new Map<string, number>();
  let row = options.row;
  const handler: Handler = (q: RecordedQuery) => {
    if (q.table === "rpc:rate_limit_hit") {
      const { p_key, p_limit } = q.calls[0]![1][0] as { p_key: string; p_limit: number };
      const count = (hits.get(p_key) ?? 0) + 1;
      hits.set(p_key, count);
      return { data: [{ allowed: count <= p_limit, retry_after: count <= p_limit ? 0 : 60 }] };
    }
    if (q.table === "rpc:submit_meeting_request") return { data: options.submit ?? null };
    if (q.table === "profiles") return { data: { id: OWNER_ID, slug: "diego", full_name: "Diego Molina" } };
    if (q.table === "meeting_requests" && first(q) === "update") {
      const patch = q.calls[0]![1][0] as Record<string, unknown>;
      updates.push(patch);
      if (options.raced) return { data: null };
      const updated = { ...row, ...patch };
      if (!options.frozen) row = updated;
      return { data: updated };
    }
    if (q.table === "meeting_requests") return { data: row };
    return {};
  };
  const fake = fakeSupabase(handler);
  const client = {
    ...(fake.client as unknown as Record<string, unknown>),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "diego@example.com" } }, error: null }) } },
  } as unknown as TypedSupabaseClient;
  return { client, queries: fake.queries, updates };
}

/** What the code sent to Resend's API. */
export interface SentEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
  reply_to?: string;
  attachments?: Array<{ filename: string; content: string; content_type: string }>;
}

export function decodeAttachment(email: SentEmail): string {
  return Buffer.from(email.attachments![0]!.content, "base64").toString("utf8");
}
