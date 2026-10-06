import "server-only";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { getMeetingRecord, listUnansweredGuestProposals, updateMeeting, withOwnerEmail, type MeetingRecord } from "@/lib/data/meetings";
import { isEmailConfigured, sendEmail, type EmailAttachment } from "@/lib/email";
import { getSigningSecret } from "@/lib/config.server";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { buildIcs, googleCalendarUrl, type CalendarMethod } from "./calendar";
import { cancelledEmail, confirmedEmail, declinedEmail, expiredEmail, proposalEmail, type MeetingEmail, type MeetingEmailContext } from "./emails";
import { EXPIRY_NOTICE_WINDOW_MS, expiredWithin } from "./expiry";
import { meetingUrl } from "./links";
import { meetingEvent, ownerContactEmail, type Meeting, type MeetingOwner } from "./model";
import { HORIZON_DAYS } from "./schema";
import { applyChange, otherParty, type MeetingChange, type MeetingParty } from "./state";

/**
 * The meeting flow on the server: applies changes (checked against the
 * current state, first writer wins) and sends each side the right email.
 * Emails are best effort: the page already showed the result, and a lost
 * email shouldn't undo a confirmed meeting.
 */

const DAY_MS = 24 * 60 * 60_000;
const DEFAULT_DAILY_BUDGET = 60;

// New-proposal emails per owner and day; the rest still show in the editor.
const ownerProposalLimiter = createSharedRateLimiter({ name: "meeting-email-owner", limit: 30, windowMs: DAY_MS });
// Anyone can open a card and answer their own proposal, so emails to a
// visitor's (unverified) address are capped per address and per card owner.
const guestAddressLimiter = createSharedRateLimiter({ name: "meeting-email-guest", limit: 5, windowMs: DAY_MS });
const ownerToGuestsLimiter = createSharedRateLimiter({ name: "meeting-email-to-guests", limit: 40, windowMs: DAY_MS });
// One «ha caducado» per meeting: the cron's look-back overlaps from one day to the next.
const expiryNoticeLimiter = createSharedRateLimiter({ name: "meeting-email-expired", limit: 1, windowMs: 3 * DAY_MS });

/**
 * All meeting emails share one daily budget, kept below the email plan's
 * limit: login codes go through the same account and must never run out.
 */
let budget: { limit: number; limiter: ReturnType<typeof createSharedRateLimiter> } | null = null;

function dailyBudget() {
  const configured = Number(process.env.MEETING_EMAIL_DAILY_BUDGET);
  const limit = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_DAILY_BUDGET;
  if (budget?.limit !== limit) budget = { limit, limiter: createSharedRateLimiter({ name: "meeting-email-all", limit, windowMs: DAY_MS }) };
  return budget.limiter;
}

/**
 * Whether cards can take proposals here: they need signed links and email
 * (both sides answer from their inbox). Demo mode simulates everything.
 */
export function meetingsAvailable(): boolean {
  if (!isSupabaseConfigured()) return true;
  return getSigningSecret() !== null && isEmailConfigured();
}

type EmailKind = "proposal" | "confirmed" | "declined" | "cancelled" | "expired";

interface Delivery {
  kind: EmailKind;
  to: string | null;
  email: MeetingEmail;
  replyTo?: string | null;
  attachments?: EmailAttachment[];
  /** Owner id when the recipient is the visitor (their address is unverified). */
  toGuestOf?: string;
}

function siteHost(): string {
  try {
    return new URL(getSiteUrl()).host;
  } catch {
    return "passme.app";
  }
}

/** The address invitations come "from" when the owner has no login email (shouldn't happen). */
function fallbackAddress(): string {
  const from = process.env.PASSME_EMAIL_FROM ?? "";
  return /<([^>]+)>/.exec(from)?.[1] ?? (from.includes("@") ? from.trim() : `hola@${siteHost()}`);
}

function emailContext(meeting: Meeting, owner: MeetingOwner): MeetingEmailContext {
  // The only owner address an email shows is the one the guest gets.
  return {
    meeting,
    owner: { name: owner.name, slug: owner.slug, email: ownerContactEmail(owner), ...(owner.timeZone ? { timeZone: owner.timeZone } : {}) },
    siteUrl: getSiteUrl(),
  };
}

async function deliver({ kind, to, email, replyTo, attachments, toGuestOf }: Delivery): Promise<void> {
  if (!to) return;
  if (toGuestOf) {
    const allowed =
      (await guestAddressLimiter.check(to.toLowerCase())).ok && (await ownerToGuestsLimiter.check(toGuestOf)).ok;
    if (!allowed) {
      log.warn("meeting email to guest skipped: limit reached", { kind });
      return;
    }
  }
  if (!(await dailyBudget().check("all")).ok) {
    log.warn("meeting email skipped: daily budget reached", { kind });
    return;
  }
  const sent = await sendEmail({ to, subject: email.subject, text: email.text, html: email.html, replyTo, attachments });
  if (!sent) log.warn("meeting email not sent", { kind });
}

/** The meeting as an .ics attachment (method in the content type too: Outlook reads it there). */
/** The owner as each side's calendar sees them: the guest's copy shows the card's email. */
function organizer(owner: MeetingOwner, recipient: MeetingParty): { name: string; email: string } {
  const email = recipient === "guest" ? ownerContactEmail(owner) : owner.email;
  return { name: owner.name, email: email ?? fallbackAddress() };
}

function invitation(meeting: Meeting, owner: MeetingOwner, recipient: MeetingParty, method: CalendarMethod): EmailAttachment {
  const event = meetingEvent(meeting, organizer(owner, recipient), recipient, { uidDomain: siteHost() });
  return {
    filename: method === "CANCEL" ? "cancelacion.ics" : "invitacion.ics",
    content: buildIcs(event, method),
    contentType: `text/calendar; charset=utf-8; method=${method}`,
  };
}

/** Right after a visitor proposes: the owner gets the times as buttons. */
export async function notifyNewProposal(meetingId: string): Promise<void> {
  if (!isEmailConfigured()) return;
  const record = await getMeetingRecord(meetingId);
  if (!record) return;
  if (!(await ownerProposalLimiter.check(record.owner.id)).ok) return;
  const owner = await withOwnerEmail(record.owner);
  const respond = meetingUrl(meetingId, "owner");
  if (!respond) return;
  // Replying from the inbox reaches the visitor directly.
  await deliver({
    kind: "proposal",
    to: owner.email,
    email: proposalEmail(emailContext(record.meeting, owner), respond),
    replyTo: record.meeting.guest.email,
  });
}

function confirmationTo(party: MeetingParty, meeting: Meeting, owner: MeetingOwner): Delivery | null {
  const manage = meetingUrl(meeting.id, party);
  if (!manage) return null;
  const event = meetingEvent(meeting, organizer(owner, party), party, { uidDomain: siteHost() });
  const other = otherParty(party);
  return {
    kind: "confirmed",
    to: party === "owner" ? owner.email : meeting.guest.email,
    email: confirmedEmail(emailContext(meeting, owner), party, { manage, googleCalendar: googleCalendarUrl(event) }),
    // Once confirmed, replies go straight to the other person.
    replyTo: other === "owner" ? ownerContactEmail(owner) : meeting.guest.email,
    attachments: [invitation(meeting, owner, party, "PUBLISH")],
    toGuestOf: party === "guest" ? owner.id : undefined,
  };
}

/** Who hears about `action` by `actor`, and what they get. */
function deliveriesFor(before: Meeting, meeting: Meeting, owner: MeetingOwner, actor: MeetingParty, action: MeetingChange["action"]): Delivery[] {
  const ctx = emailContext(meeting, owner);
  const recipient = otherParty(actor);
  const to = recipient === "owner" ? owner.email : meeting.guest.email;
  const toGuestOf = recipient === "guest" ? owner.id : undefined;
  // The owner's address stays private until they confirm.
  const replyTo = recipient === "owner" ? meeting.guest.email : null;
  const respond = meetingUrl(meeting.id, recipient);

  switch (action) {
    case "confirm":
      return (["guest", "owner"] as const).map((party) => confirmationTo(party, meeting, owner)).filter((d): d is Delivery => d !== null);
    case "counter":
      return respond ? [{ kind: "proposal", to, email: proposalEmail(ctx, respond), replyTo, toGuestOf }] : [];
    case "decline":
      return respond ? [{ kind: "declined", to, email: declinedEmail(ctx, { respond }), replyTo, toGuestOf }] : [];
    case "cancel": {
      const wasConfirmed = before.status === "confirmed";
      // A visitor withdrawing a proposal the owner never answered can't send them words.
      const showNote = actor === "owner" || wasConfirmed || before.proposedBy === "owner";
      const actorAddress = actor === "owner" ? ownerContactEmail(owner) : meeting.guest.email;
      return [
        {
          kind: "cancelled",
          to,
          email: cancelledEmail(ctx, { wasConfirmed, showNote }),
          replyTo: wasConfirmed ? actorAddress : replyTo,
          attachments: wasConfirmed ? [invitation(meeting, owner, recipient, "CANCEL")] : [],
          toGuestOf,
        },
      ];
    }
  }
}

export type ChangeMeetingResult =
  | { ok: true; record: MeetingRecord; emails: () => Promise<void> }
  | { ok: false; error: string };

/**
 * Applies `change` for `party` to a meeting the caller loaded (after checking
 * the signed link). The caller runs `emails` after responding (next/server
 * `after`), so the page isn't held up.
 */
export async function changeMeeting(
  record: MeetingRecord,
  party: MeetingParty,
  change: MeetingChange,
  now: Date = new Date(),
): Promise<ChangeMeetingResult> {
  const { id } = record.meeting;
  const applied = applyChange(record.meeting, party, change, now);
  if (!applied.ok) return { ok: false, error: applied.error };

  const updated = await updateMeeting(id, record.meeting.sequence, applied.patch);
  if (!updated) return { ok: false, error: "Ha cambiado mientras respondías. Recarga la página para ver cómo está." };

  const emails = async () => {
    if (!isEmailConfigured()) return;
    const owner = await withOwnerEmail(record.owner);
    for (const delivery of deliveriesFor(record.meeting, updated, owner, party, change.action)) await deliver(delivery);
  };
  return {
    ok: true,
    record: { meeting: updated, owner: record.owner },
    emails: () => emails().catch((error: unknown) => log.error("meeting emails failed", { id }, error)),
  };
}

/**
 * Daily cron: tells each visitor whose proposal ran out of times unanswered
 * (fixed text, «Proponer otras horas» back to the card). Goes through the
 * same per-address, per-owner and global caps as every guest email.
 * Returns how many proposals qualified.
 */
export async function notifyExpiredProposals(now: Date = new Date()): Promise<number> {
  if (!isEmailConfigured()) return 0;
  const candidates = await listUnansweredGuestProposals(now, HORIZON_DAYS + 2);
  const expired = candidates.filter(({ meeting }) => expiredWithin(meeting, now, EXPIRY_NOTICE_WINDOW_MS));
  const siteUrl = getSiteUrl();
  for (const { meeting, owner, takesProposals } of expired) {
    if (!(await expiryNoticeLimiter.check(meeting.id)).ok) continue;
    const proposeAgain = takesProposals ? `${siteUrl}/u/${encodeURIComponent(owner.slug)}?reunion=1` : null;
    await deliver({
      kind: "expired",
      to: meeting.guest.email,
      email: expiredEmail({ meeting, owner: { name: owner.name, slug: owner.slug, email: null }, siteUrl }, { proposeAgain }),
      toGuestOf: owner.id,
    });
  }
  return expired.length;
}
