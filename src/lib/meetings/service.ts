import "server-only";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import {
  findMeetingRecord,
  listUnansweredGuestProposals,
  updateMeeting,
  withOwnerEmail,
  type MeetingRecord,
} from "@/lib/data/meetings";
import { isEmailConfigured, sendEmailDetailed, type EmailAttachment } from "@/lib/email";
import { getSigningSecret } from "@/lib/config.server";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { buildIcs, googleCalendarUrl, type CalendarMethod } from "./calendar";
import { cancelledEmail, confirmedEmail, declinedEmail, expiredEmail, proposalEmail, type MeetingEmail, type MeetingEmailContext } from "./emails";
import { EXPIRY_NOTICE_WINDOW_MS, expiredWithin, lastSlotStart } from "./expiry";
import { meetingUrl } from "./links";
import { mailboxKey } from "./mailbox";
import { meetingEvent, ownerContactEmail, type Meeting, type MeetingOwner } from "./model";
import { HORIZON_DAYS } from "./schema";
import { applyChange, otherParty, type MeetingChange, type MeetingParty } from "./state";

/**
 * The meeting flow on the server: applies changes (checked against the
 * current state, first writer wins) and sends each side the right email.
 *
 * Emails are best effort (a lost email shouldn't undo a confirmed meeting) but
 * never silent: every email that is held back or fails is logged with its kind,
 * meeting and side, and the callers learn whether any was held back so the
 * page can say so instead of promising an invitation that isn't coming.
 * Who may send what is decided when the change is made (`admit`, a few fast
 * counter lookups); the sending itself runs after the response.
 */

const DAY_MS = 24 * 60 * 60_000;
const DEFAULT_DAILY_BUDGET = 60;
/**
 * The part of the daily budget that mail nobody asked for may use: an unknown
 * visitor's proposal, its withdrawal and the «ha caducado» notices. The rest is
 * kept for answers (confirmations, other times) that an owner's tap prompted.
 */
const ANONYMOUS_SHARE = 0.4;

// First emails an unknown visitor can provoke, per owner and day; the rest still show in the editor.
const ownerUnpromptedLimiter = createSharedRateLimiter({ name: "meeting-email-owner", limit: 30, windowMs: DAY_MS });
// Visitors' answers to something the owner started (other times, a cancel…): their own, separate allowance.
const ownerRepliesLimiter = createSharedRateLimiter({ name: "meeting-email-owner-replies", limit: 30, windowMs: DAY_MS });
// Anyone can open a card and answer their own proposal, so emails to a
// visitor's (unverified) address are capped per mailbox and per card owner.
const guestAddressLimiter = createSharedRateLimiter({ name: "meeting-email-guest", limit: 5, windowMs: DAY_MS });
const ownerToGuestsLimiter = createSharedRateLimiter({ name: "meeting-email-to-guests", limit: 40, windowMs: DAY_MS });
/**
 * One «ha caducado» per meeting, and the counter doubles as its "sent" mark: a
 * run takes an attempt before sending (the cron's look-back overlaps from one
 * day to the next) and, only once the email has gone, a second hit that locks
 * the meeting for good. A failed attempt leaves one retry for the next run.
 */
const EXPIRY_ATTEMPTS = 2;
const expiryNoticeLimiter = createSharedRateLimiter({ name: "meeting-email-expired-v2", limit: EXPIRY_ATTEMPTS, windowMs: 3 * DAY_MS });

type Limiter = ReturnType<typeof createSharedRateLimiter>;
let budgets: { limit: number; all: Limiter; anonymous: Limiter } | null = null;

/**
 * All meeting emails share one daily budget, kept below the email plan's
 * limit: login codes go through the same account and must never run out.
 * Mail nobody asked for also draws on its own, smaller slice of it.
 */
function dailyBudgets() {
  const configured = Number(process.env.MEETING_EMAIL_DAILY_BUDGET);
  const limit = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_DAILY_BUDGET;
  if (budgets?.limit !== limit) {
    budgets = {
      limit,
      all: createSharedRateLimiter({ name: "meeting-email-all", limit, windowMs: DAY_MS }),
      anonymous: createSharedRateLimiter({ name: "meeting-email-anonymous", limit: Math.max(1, Math.floor(limit * ANONYMOUS_SHARE)), windowMs: DAY_MS }),
    };
  }
  return budgets;
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

/** Why an email was held back. */
export type SkipReason =
  | "no_recipient"
  | "address_cap"
  | "owner_cap"
  | "anonymous_budget"
  | "daily_budget"
  | "email_not_configured"
  | "no_link"
  | "limiter_error";

/** Held back on purpose (a cap doing its job) rather than because something is broken. */
const PROTECTIVE: ReadonlySet<SkipReason> = new Set(["address_cap", "owner_cap", "anonymous_budget", "daily_budget"]);

/** What an email is, who gets it and which allowances it spends. */
interface Route {
  kind: EmailKind;
  meetingId: string;
  /** Who receives it. */
  party: MeetingParty;
  /** Owner id when the recipient is the visitor (their address is unverified): per-mailbox and per-owner caps. */
  toGuestOf?: string;
  /** Owner id when a visitor nobody has answered yet reaches the owner: the owner's daily allowance for first contacts. */
  unpromptedFor?: string;
  /** Owner id when a visitor answers something the owner started: the owner's daily allowance for answers. */
  repliesFor?: string;
  /** Nobody with an account asked for this email: it draws on the smaller anonymous slice of the budget. */
  anonymous?: boolean;
}

interface Delivery extends Route {
  to: string | null;
  email: MeetingEmail;
  replyTo?: string | null;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}

/** How many emails of a batch went, were held back or failed. */
export interface DeliveryReport {
  sent: number;
  skipped: number;
  failed: number;
}

const NOTHING_SENT: DeliveryReport = { sent: 0, skipped: 0, failed: 0 };

function logSkip(route: Route, reason: SkipReason): void {
  const context = { kind: route.kind, meetingId: route.meetingId, party: route.party, reason };
  if (PROTECTIVE.has(reason)) log.warn("meeting email skipped", context);
  else log.error("meeting email skipped", context);
}

/**
 * Asks the allowances for one email, spending them. Null when it may go;
 * otherwise why not. `to` is the address when the route needs it (visitors).
 */
async function admit(route: Route, to: string | null | undefined): Promise<SkipReason | null> {
  try {
    if (route.toGuestOf) {
      if (!to) return "no_recipient";
      if (!(await guestAddressLimiter.check(mailboxKey(to))).ok) return "address_cap";
      if (!(await ownerToGuestsLimiter.check(route.toGuestOf)).ok) return "owner_cap";
    }
    if (route.unpromptedFor && !(await ownerUnpromptedLimiter.check(route.unpromptedFor)).ok) return "owner_cap";
    if (route.repliesFor && !(await ownerRepliesLimiter.check(route.repliesFor)).ok) return "owner_cap";
    const { all, anonymous } = dailyBudgets();
    if (route.anonymous && !(await anonymous.check("all")).ok) return "anonymous_budget";
    if (!(await all.check("all")).ok) return "daily_budget";
    return null;
  } catch (error) {
    log.error("meeting email allowance check failed", { kind: route.kind, meetingId: route.meetingId, party: route.party }, error);
    return "limiter_error";
  }
}

/** Sends one email that was admitted. Never throws; provider failures are logged as errors. */
async function transmit(delivery: Delivery): Promise<"sent" | "failed"> {
  const { kind, meetingId, party, to, email, replyTo, attachments, headers } = delivery;
  if (!to) return "failed";
  try {
    const result = await sendEmailDetailed({ to, subject: email.subject, text: email.text, html: email.html, replyTo, attachments, headers });
    if (result.ok) return "sent";
    log.error("meeting email failed", { kind, meetingId, party, reason: result.reason, status: result.status }, result.error);
    return "failed";
  } catch (error) {
    log.error("meeting email failed", { kind, meetingId, party, reason: "unexpected" }, error);
    return "failed";
  }
}

/** Admits and sends one email now (the cron, where nobody is waiting for an answer). */
async function dispatch(delivery: Delivery): Promise<{ status: "sent" | "failed" } | { status: "skipped"; reason: SkipReason }> {
  const reason = delivery.to ? await admit(delivery, delivery.to) : "no_recipient";
  if (reason) {
    logSkip(delivery, reason);
    return { status: "skipped", reason };
  }
  return { status: await transmit(delivery) };
}

/** Sends emails that were already admitted, each on its own: one failing doesn't hold the others back. */
async function transmitAll(deliveries: ReadonlyArray<Delivery>, skipped: number): Promise<DeliveryReport> {
  const settled = await Promise.allSettled(deliveries.map(transmit));
  let sent = 0;
  let failed = 0;
  for (const outcome of settled) {
    if (outcome.status === "fulfilled" && outcome.value === "sent") sent += 1;
    else failed += 1;
  }
  return { sent, skipped, failed };
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

/**
 * How to stop getting these: emails go to addresses nobody has verified, so
 * every one carries a List-Unsubscribe with the contact address and the page
 * that explains meetings. Mail clients show it as "Unsubscribe".
 */
export function unsubscribeHeaders(): Record<string, string> {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  const targets: string[] = [];
  if (contact && /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(contact)) {
    targets.push(`<mailto:${contact}?subject=${encodeURIComponent("Baja de avisos de reuniones")}>`);
  }
  targets.push(`<${getSiteUrl()}/privacidad#reuniones>`);
  return { "List-Unsubscribe": targets.join(", ") };
}

function emailContext(meeting: Meeting, owner: MeetingOwner): MeetingEmailContext {
  // The only owner address an email shows is the one the guest gets.
  return {
    meeting,
    owner: { name: owner.name, slug: owner.slug, email: ownerContactEmail(owner), ...(owner.timeZone ? { timeZone: owner.timeZone } : {}) },
    siteUrl: getSiteUrl(),
  };
}

/**
 * The owner as each side's calendar sees them: the guest's copy shows the
 * card's email, never the login one. Also what the signed page's .ics download
 * uses, so the two copies of an invitation always agree.
 */
export function organizer(owner: MeetingOwner, recipient: MeetingParty): { name: string; email: string } {
  const email = recipient === "guest" ? ownerContactEmail(owner) : owner.email;
  return { name: owner.name, email: email ?? fallbackAddress() };
}

/** The meeting as an .ics attachment (method in the content type too: Outlook reads it there). */
function invitation(meeting: Meeting, owner: MeetingOwner, recipient: MeetingParty, method: CalendarMethod): EmailAttachment {
  const event = meetingEvent(meeting, organizer(owner, recipient), recipient, { uidDomain: siteHost() });
  return {
    filename: method === "CANCEL" ? "cancelacion.ics" : "invitacion.ics",
    content: buildIcs(event, method),
    contentType: `text/calendar; charset=utf-8; method=${method}`,
  };
}

/** What every email to this side needs to know besides its content. */
function routeTo(recipient: MeetingParty, kind: EmailKind, meeting: Meeting, owner: MeetingOwner): Route & { headers?: Record<string, string> } {
  return recipient === "guest"
    ? { kind, meetingId: meeting.id, party: "guest", toGuestOf: owner.id, headers: unsubscribeHeaders() }
    : { kind, meetingId: meeting.id, party: "owner" };
}

/** The first email to the owner, built from the stored proposal. Null (and logged) without a signed link. */
function proposalDelivery(meeting: Meeting, owner: MeetingOwner): Delivery | null {
  const respond = meetingUrl(meeting.id, "owner");
  if (!respond) {
    log.error("meeting email not built: no signed links", { kind: "proposal", meetingId: meeting.id, party: "owner" });
    return null;
  }
  // No Reply-To: answering the proposal's email would hand the owner's address to a stranger. The buttons answer it.
  return {
    ...routeTo("owner", "proposal", meeting, owner),
    unpromptedFor: owner.id,
    anonymous: true,
    to: owner.email,
    email: proposalEmail(emailContext(meeting, owner), respond),
  };
}

/**
 * Asks the owner's allowances for a new visitor's first email, before the
 * visitor is told it was sent. True when it may go; the email itself is
 * sent later by `sendNewProposal`.
 */
export async function admitNewProposal(meetingId: string, ownerId: string): Promise<boolean> {
  if (!isEmailConfigured()) {
    logSkip({ kind: "proposal", meetingId, party: "owner" }, "email_not_configured");
    return false;
  }
  const route: Route = { kind: "proposal", meetingId, party: "owner", unpromptedFor: ownerId, anonymous: true };
  const reason = await admit(route, null);
  if (reason) logSkip(route, reason);
  return reason === null;
}

async function sendProposal(record: MeetingRecord): Promise<DeliveryReport> {
  const owner = await withOwnerEmail(record.owner);
  const delivery = proposalDelivery(record.meeting, owner);
  if (!delivery) return { ...NOTHING_SENT, skipped: 1 };
  if (!delivery.to) {
    logSkip(delivery, "no_recipient");
    return { ...NOTHING_SENT, skipped: 1 };
  }
  return transmitAll([delivery], 0);
}

/** Sends the first email to the owner of an already admitted proposal (runs after the visitor got their answer). */
export async function sendNewProposal(meetingId: string): Promise<DeliveryReport> {
  const lookup = await findMeetingRecord(meetingId);
  if (lookup.status !== "found") {
    log.error("meeting email not sent: proposal not found", { kind: "proposal", meetingId, party: "owner", reason: lookup.status });
    return { ...NOTHING_SENT, failed: 1 };
  }
  return sendProposal(lookup.record);
}

/** Right after a visitor proposes: the owner gets the times as buttons (allowances checked here too). */
export async function notifyNewProposal(meetingId: string): Promise<DeliveryReport> {
  const lookup = await findMeetingRecord(meetingId);
  if (lookup.status !== "found") {
    log.error("meeting email not sent: proposal not found", { kind: "proposal", meetingId, party: "owner", reason: lookup.status });
    return { ...NOTHING_SENT, failed: 1 };
  }
  if (!(await admitNewProposal(meetingId, lookup.record.owner.id))) return { ...NOTHING_SENT, skipped: 1 };
  return sendProposal(lookup.record);
}

function confirmationTo(party: MeetingParty, meeting: Meeting, owner: MeetingOwner): Delivery | null {
  const manage = meetingUrl(meeting.id, party);
  if (!manage) return null;
  const event = meetingEvent(meeting, organizer(owner, party), party, { uidDomain: siteHost() });
  const other = otherParty(party);
  return {
    ...routeTo(party, "confirmed", meeting, owner),
    to: party === "owner" ? owner.email : meeting.guest.email,
    email: confirmedEmail(emailContext(meeting, owner), party, { manage, googleCalendar: googleCalendarUrl(event) }),
    // Once confirmed, replies go straight to the other person.
    replyTo: other === "owner" ? ownerContactEmail(owner) : meeting.guest.email,
    attachments: [invitation(meeting, owner, party, "PUBLISH")],
  };
}

/** Builds one email without letting a failure in it take the others down. */
function buildSafely(route: Route, build: () => Delivery | null): Delivery | null {
  try {
    const delivery = build();
    if (!delivery) log.error("meeting email not built: no signed links", { kind: route.kind, meetingId: route.meetingId, party: route.party });
    return delivery;
  } catch (error) {
    log.error("meeting email not built", { kind: route.kind, meetingId: route.meetingId, party: route.party }, error);
    return null;
  }
}

/**
 * Who hears about `action` by `actor`, and what they get. Emails to the owner
 * that a visitor causes spend the owner's allowances: unprompted ones (a
 * proposal nobody answered, then withdrawn) the small anonymous slice too.
 */
function deliveriesFor(before: Meeting, meeting: Meeting, owner: MeetingOwner, actor: MeetingParty, action: MeetingChange["action"]): Array<Delivery | null> {
  const ctx = emailContext(meeting, owner);
  const recipient = otherParty(actor);
  const to = recipient === "owner" ? owner.email : meeting.guest.email;
  const respond = meetingUrl(meeting.id, recipient);
  const unprompted = actor === "guest" && before.status === "pending" && before.proposedBy === "guest";
  const fromVisitor: Partial<Route> = actor === "guest" ? (unprompted ? { unpromptedFor: owner.id, anonymous: true } : { repliesFor: owner.id }) : {};

  const build = (kind: EmailKind, content: Omit<Delivery, keyof Route | "to">): Delivery | null => {
    const route = { ...routeTo(recipient, kind, meeting, owner), ...fromVisitor };
    return buildSafely(route, () => ({ ...route, to, ...content }));
  };

  switch (action) {
    case "confirm": {
      const asked: Partial<Route> = actor === "guest" ? { repliesFor: owner.id } : {};
      return (["guest", "owner"] as const).map((party) =>
        buildSafely({ kind: "confirmed", meetingId: meeting.id, party }, () => {
          const delivery = confirmationTo(party, meeting, owner);
          // The visitor confirming the owner's other times is a visitor's email to the owner: it counts.
          return delivery && party === "owner" ? { ...delivery, ...asked } : delivery;
        }),
      );
    }
    case "counter":
      return [respond ? build("proposal", { email: proposalEmail(ctx, respond), replyTo: undefined }) : null];
    case "decline":
      return [respond ? build("declined", { email: declinedEmail(ctx, { respond }) }) : null];
    case "cancel": {
      const wasConfirmed = before.status === "confirmed";
      // A visitor withdrawing a proposal the owner never answered can't send them words.
      const showNote = actor === "owner" || wasConfirmed || before.proposedBy === "owner";
      const actorAddress = actor === "owner" ? ownerContactEmail(owner) : meeting.guest.email;
      return [
        build("cancelled", {
          email: cancelledEmail(ctx, { wasConfirmed, showNote }),
          // Once confirmed the two may write to each other; before that the owner's address stays private.
          replyTo: wasConfirmed ? actorAddress : undefined,
          attachments: wasConfirmed ? [invitation(meeting, owner, recipient, "CANCEL")] : [],
        }),
      ];
    }
  }
}

export type ChangeMeetingResult =
  | {
      ok: true;
      /** The stored meeting; the owner carries their addresses once emails were prepared (nothing private is shown by `toMeetingView`). */
      record: MeetingRecord;
      /** Sends the emails that were admitted. Run it after responding (next/server `after`); it never throws. */
      emails: () => Promise<DeliveryReport>;
      /** At least one email couldn't be sent (an allowance, a missing address or setup): tell the person so. */
      emailsSkipped: boolean;
    }
  | {
      ok: false;
      error: string;
      /** not_allowed: the state doesn't take it. conflict: somebody changed it first. unavailable: the database failed; retry. */
      reason: "not_allowed" | "conflict" | "unavailable";
    };

export const CHANGED_MEANWHILE = "Ha cambiado mientras respondías. Recarga la página para ver cómo está.";
export const COULD_NOT_SAVE = "No hemos podido guardar el cambio. Inténtalo de nuevo.";

const KIND_OF_ACTION: Record<MeetingChange["action"], EmailKind> = {
  confirm: "confirmed",
  counter: "proposal",
  decline: "declined",
  cancel: "cancelled",
};

/**
 * Admits the emails a change calls for. Never throws: a meeting that was
 * saved stays saved whatever happens to its emails.
 */
async function prepareEmails(
  record: MeetingRecord,
  meeting: Meeting,
  party: MeetingParty,
  action: MeetingChange["action"],
): Promise<{ owner: MeetingOwner; send: () => Promise<DeliveryReport>; skipped: boolean }> {
  const idle = async () => NOTHING_SENT;
  if (!isEmailConfigured()) {
    logSkip({ kind: KIND_OF_ACTION[action], meetingId: meeting.id, party: otherParty(party) }, "email_not_configured");
    return { owner: record.owner, send: idle, skipped: true };
  }
  try {
    const owner = await withOwnerEmail(record.owner);
    const built = deliveriesFor(record.meeting, meeting, owner, party, action);
    const deliveries = built.filter((d): d is Delivery => d !== null);
    // An email that couldn't be built has been logged already; it counts as held back.
    let skipped = built.length - deliveries.length;

    const reasons = await Promise.all(deliveries.map((d) => (d.to ? admit(d, d.to) : Promise.resolve("no_recipient" as const))));
    const admitted: Delivery[] = [];
    deliveries.forEach((delivery, index) => {
      const reason = reasons[index]!;
      if (reason) {
        logSkip(delivery, reason);
        skipped += 1;
      } else admitted.push(delivery);
    });
    return { owner, send: () => transmitAll(admitted, skipped), skipped: skipped > 0 };
  } catch (error) {
    log.error("meeting emails not prepared", { meetingId: meeting.id, party: otherParty(party) }, error);
    return { owner: record.owner, send: idle, skipped: true };
  }
}

/**
 * Applies `change` for `party` to a meeting the caller loaded (after checking
 * the signed link). The caller runs `emails` after responding (next/server
 * `after`), so the page isn't held up by the mail provider.
 */
export async function changeMeeting(
  record: MeetingRecord,
  party: MeetingParty,
  change: MeetingChange,
  now: Date = new Date(),
): Promise<ChangeMeetingResult> {
  const applied = applyChange(record.meeting, party, change, now);
  if (!applied.ok) return { ok: false, error: applied.error, reason: "not_allowed" };

  const updated = await updateMeeting(record.meeting.id, record.meeting.sequence, applied.patch);
  if (updated.status === "conflict") return { ok: false, error: CHANGED_MEANWHILE, reason: "conflict" };
  if (updated.status === "error") return { ok: false, error: COULD_NOT_SAVE, reason: "unavailable" };

  const prepared = await prepareEmails(record, updated.meeting, party, change.action);
  return {
    ok: true,
    record: { meeting: updated.meeting, owner: prepared.owner },
    emails: prepared.send,
    emailsSkipped: prepared.skipped,
  };
}

/** The cron's pace: a run stays inside its function time and never mails more than this. */
export const EXPIRY_MAX_PER_RUN = 100;
export const EXPIRY_TIME_BUDGET_MS = 40_000;

/** What one daily run of the «ha caducado» notices did. */
export interface ExpiryRun {
  /** Proposals that ran out of times unanswered inside the look-back window. */
  qualified: number;
  /** Emails admitted and tried (a first attempt or the retry of one that failed). */
  attempted: number;
  sent: number;
  /** Told already (or tried twice already) by an earlier run. */
  alreadyNotified: number;
  /**
   * Held back by an allowance. It still spends one of the meeting's two attempts (the shared
   * limiter can't give one back), so a notice held back on two runs is not sent.
   */
  skipped: number;
  failed: number;
  /** The run hit its count or time limit; the rest waits for the next one. */
  truncated: boolean;
  /** The proposals couldn't be listed (database down) or email isn't set up: nothing was tried. */
  problem?: "lookup_failed" | "email_not_configured";
}

interface ExpiryOptions {
  maxNotices?: number;
  timeBudgetMs?: number;
  /** Milliseconds clock, for tests. */
  clock?: () => number;
}

/**
 * Daily cron: tells each visitor whose proposal ran out of times unanswered
 * (fixed text, «Proponer otras horas» back to the card). Goes through the
 * same per-mailbox, per-owner and global caps as every guest email, in the
 * anonymous slice. Bounded in count and time so it can't starve the run.
 */
export async function notifyExpiredProposals(now: Date = new Date(), options: ExpiryOptions = {}): Promise<ExpiryRun> {
  const run: ExpiryRun = { qualified: 0, attempted: 0, sent: 0, alreadyNotified: 0, skipped: 0, failed: 0, truncated: false };
  if (!isEmailConfigured()) return { ...run, problem: "email_not_configured" };

  const clock = options.clock ?? Date.now;
  const deadline = clock() + (options.timeBudgetMs ?? EXPIRY_TIME_BUDGET_MS);
  const maxNotices = options.maxNotices ?? EXPIRY_MAX_PER_RUN;

  const candidates = await listUnansweredGuestProposals(now, HORIZON_DAYS + 2);
  if (candidates === null) return { ...run, problem: "lookup_failed" };

  // Oldest first: those are the closest to leaving the look-back window.
  const expired = candidates
    .filter(({ meeting }) => expiredWithin(meeting, now, EXPIRY_NOTICE_WINDOW_MS))
    .sort((a, b) => (lastSlotStart(a.meeting) ?? 0) - (lastSlotStart(b.meeting) ?? 0));
  run.qualified = expired.length;

  const siteUrl = getSiteUrl();
  for (const { meeting, owner, takesProposals } of expired) {
    if (run.attempted + run.skipped >= maxNotices || clock() > deadline) {
      run.truncated = true;
      break;
    }
    // Takes one of the meeting's attempts; a meeting already told (or tried twice) is over its limit.
    if (!(await expiryNoticeLimiter.check(meeting.id)).ok) {
      run.alreadyNotified += 1;
      continue;
    }
    const proposeAgain = takesProposals ? `${siteUrl}/u/${encodeURIComponent(owner.slug)}?reunion=1` : null;
    const outcome = await dispatch({
      kind: "expired",
      meetingId: meeting.id,
      party: "guest",
      toGuestOf: owner.id,
      anonymous: true,
      to: meeting.guest.email,
      email: expiredEmail({ meeting, owner: { name: owner.name, slug: owner.slug, email: null }, siteUrl }, { proposeAgain }),
      headers: unsubscribeHeaders(),
    });
    if (outcome.status === "skipped") {
      run.skipped += 1;
      continue;
    }
    run.attempted += 1;
    if (outcome.status === "failed") {
      run.failed += 1;
      continue;
    }
    run.sent += 1;
    // Sent: lock the meeting, so the next run's overlap can't tell them twice.
    await expiryNoticeLimiter.check(meeting.id);
  }
  return run;
}
