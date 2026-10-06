import type { Meeting } from "./model";

/**
 * Which proposals get the «ha caducado» email (P8.2). The daily cleanup cron
 * picks a visitor's proposal the owner never answered once its last time has
 * started, looking back a little more than a day so a late run misses nothing;
 * a per-meeting limiter in the service stops the overlap from sending twice.
 */

export const EXPIRY_NOTICE_WINDOW_MS = 36 * 60 * 60_000;

/** The start of a proposal's last time (when it runs out), or null without times. */
export function lastSlotStart(meeting: Pick<Meeting, "slots">): number | null {
  const times = meeting.slots.map((slot) => new Date(slot).getTime()).filter((time) => Number.isFinite(time));
  return times.length > 0 ? Math.max(...times) : null;
}

/** A visitor's proposal, still unanswered, whose last time started in (now − window, now]. */
export function expiredWithin(meeting: Pick<Meeting, "status" | "proposedBy" | "slots">, now: Date, windowMs = EXPIRY_NOTICE_WINDOW_MS): boolean {
  if (meeting.status !== "pending" || meeting.proposedBy !== "guest") return false;
  // Same rule as openSlots(): a time stays open until it starts.
  const last = lastSlotStart(meeting);
  return last !== null && last > now.getTime() - windowMs && last <= now.getTime();
}
