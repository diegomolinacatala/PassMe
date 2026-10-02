import "server-only";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { getMeetingRecord, updateMeeting, withOwnerEmail, type MeetingRecord } from "@/lib/data/meetings";
import { isEmailConfigured, sendEmail, type EmailAttachment } from "@/lib/email";
import { getSigningSecret } from "@/lib/config.server";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { buildIcs, googleCalendarUrl, type CalendarMethod } from "./calendar";
import { cancelledEmail, confirmedEmail, declinedEmail, proposalEmail, type MeetingEmail, type MeetingEmailContext } from "./emails";
import { meetingUrl } from "./links";
import { meetingEvent, type Meeting, type MeetingOwner } from "./model";
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

type EmailKind = "proposal" | "confirmed" | "declined" | "cancelled";

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
  return { meeting, owner: { name: owner.name, slug: owner.slug, email: owner.email }, siteUrl: getSiteUrl() };
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
function invitation(meeting: Meeting, owner: MeetingOwner, recipient: MeetingParty, method: CalendarMethod): EmailAttachment {
  const event = meetingEvent(meeting, { name: owner.name, email: owner.email ?? fallbackAddress() }, recipient, { uidDomain: siteHost() });
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
  const event = meetingEvent(meeting, { name: owner.name, email: owner.email ?? fallbackAddress() }, party, { uidDomain: siteHost() });
  const other = otherParty(party);
  return {
    kind: "confirmed",
    to: party === "owner" ? owner.email : meeting.guest.email,
    email: confirmedEmail(emailContext(meeting, owner), party, { manage, googleCalendar: googleCalendarUrl(event) }),
    // Once confirmed, replies go straight to the other person.
    replyTo: other === "owner" ? owner.email : meeting.guest.email,
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
      const actorAddress = actor === "owner" ? owner.email : meeting.guest.email;
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
