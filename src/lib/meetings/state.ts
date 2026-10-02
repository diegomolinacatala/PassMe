/**
 * The life of a meeting proposal, as pure functions (tested without a
 * database). Whoever made the current proposal waits; the other side
 * confirms one of the times, proposes others or declines. Once confirmed,
 * either side can cancel.
 */
import { addMinutes } from "./time";

export type MeetingStatus = "pending" | "confirmed" | "declined" | "cancelled";
export type MeetingParty = "owner" | "guest";
export type MeetingAction = "confirm" | "counter" | "decline" | "cancel";

/** What the people involved see: pending proposals expire and confirmed meetings pass. */
export type MeetingStage = "awaiting" | "confirmed" | "declined" | "cancelled" | "expired" | "past";

/** After this many changes a meeting only accepts a final answer (no more counter-proposals). */
export const MAX_ROUNDS = 10;

export interface MeetingState {
  status: MeetingStatus;
  proposedBy: MeetingParty;
  slots: ReadonlyArray<string>;
  confirmedStart: string | null;
  durationMinutes: number;
  sequence: number;
}

export function otherParty(party: MeetingParty): MeetingParty {
  return party === "owner" ? "guest" : "owner";
}

/** Proposed times that haven't started yet. */
export function openSlots(meeting: MeetingState, now: Date): string[] {
  return meeting.slots.filter((slot) => new Date(slot).getTime() > now.getTime());
}

export function meetingStage(meeting: MeetingState, now: Date): MeetingStage {
  switch (meeting.status) {
    case "pending":
      return openSlots(meeting, now).length > 0 ? "awaiting" : "expired";
    case "confirmed": {
      const end = addMinutes(meeting.confirmedStart ?? meeting.slots[0]!, meeting.durationMinutes);
      return new Date(end).getTime() > now.getTime() ? "confirmed" : "past";
    }
    case "declined":
      return "declined";
    case "cancelled":
      return "cancelled";
  }
}

export function allowedActions(meeting: MeetingState, party: MeetingParty, now: Date): MeetingAction[] {
  const stage = meetingStage(meeting, now);
  if (stage === "confirmed") return ["cancel"];
  if (stage !== "awaiting") return [];
  if (party === meeting.proposedBy) return ["cancel"];
  return meeting.sequence < MAX_ROUNDS ? ["confirm", "counter", "decline"] : ["confirm", "decline"];
}

export type MeetingChange =
  | { action: "confirm"; slot: string; location?: string }
  | { action: "counter"; slots: ReadonlyArray<string>; note: string }
  | { action: "decline"; note: string }
  | { action: "cancel"; note: string };

/** Columns to update, in database terms. */
export interface MeetingPatch {
  status: MeetingStatus;
  proposed_by?: MeetingParty;
  slots?: string[];
  confirmed_start?: string;
  location?: string;
  response_note: string;
  closed_by?: MeetingParty | null;
  sequence: number;
}

export type ApplyResult = { ok: true; patch: MeetingPatch } | { ok: false; error: string };

const ANSWERED = "Esta propuesta ya no admite cambios.";

/** Validates a change against the current state and returns what to store. */
export function applyChange(meeting: MeetingState, party: MeetingParty, change: MeetingChange, now: Date): ApplyResult {
  if (!allowedActions(meeting, party, now).includes(change.action)) return { ok: false, error: ANSWERED };
  const sequence = meeting.sequence + 1;

  switch (change.action) {
    case "confirm": {
      if (!openSlots(meeting, now).includes(change.slot)) return { ok: false, error: "Esa hora ya no está disponible." };
      return {
        ok: true,
        patch: {
          status: "confirmed",
          confirmed_start: change.slot,
          ...(change.location === undefined ? {} : { location: change.location }),
          response_note: "",
          closed_by: null,
          sequence,
        },
      };
    }
    case "counter":
      return {
        ok: true,
        patch: { status: "pending", proposed_by: party, slots: [...change.slots], response_note: change.note, sequence },
      };
    case "decline":
      return { ok: true, patch: { status: "declined", response_note: change.note, closed_by: party, sequence } };
    case "cancel":
      return { ok: true, patch: { status: "cancelled", response_note: change.note, closed_by: party, sequence } };
  }
}
