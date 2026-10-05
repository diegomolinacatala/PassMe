/**
 * "Something is waiting for you" at the top of the editor: meeting proposals
 * to answer and contacts nobody has looked at yet. Pure, so the wording and
 * the counting are unit tested; the editor only renders it.
 */

export interface PendingNotice {
  id: "meetings" | "contacts";
  /** Name in bold at the start of the sentence, when there's a single one. */
  lead: string | null;
  text: string;
  action: "Responder" | "Ver";
  href: string;
}

/** A proposal the owner hasn't answered yet (the "Te toca responder" group). */
export function needsOwnerAnswer(view: { stage: string; actions: ReadonlyArray<string> }): boolean {
  return view.stage === "awaiting" && view.actions.includes("confirm");
}

export function meetingsNotice(toAnswer: ReadonlyArray<{ name: string; href: string | null }>): PendingNotice | null {
  if (toAnswer.length === 0) return null;
  if (toAnswer.length === 1) {
    const only = toAnswer[0]!;
    return { id: "meetings", lead: only.name, text: "te ha propuesto una reunión", action: "Responder", href: only.href ?? "#reuniones" };
  }
  return { id: "meetings", lead: null, text: `Tienes ${toAnswer.length} propuestas de reunión`, action: "Ver", href: "#reuniones" };
}

/**
 * When "Ver" was last pressed on the contacts notice, per browser (there's no
 * "seen" flag in the database). A cookie rather than localStorage so the
 * server already knows: the notice is in the first paint instead of pushing
 * the editor down after hydration.
 */
export const CONTACTS_SEEN_COOKIE = "passme_contacts_seen";
const SEEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The cookie's value if it's a real date, else null (never pressed, or tampered with). */
export function parseSeenCookie(value: string | null | undefined): string | null {
  if (!value || value.length > 40) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** `document.cookie` assignment remembering `seenAt` for the editor only. */
export function seenCookie(seenAt: string, secure: boolean): string {
  return `${CONTACTS_SEEN_COOKIE}=${seenAt}; Path=/dashboard; Max-Age=${SEEN_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Contacts newer than the last time "Ver" was pressed in this browser. Never pressed: all of them. */
export function unseenContacts<T extends { createdAt: string }>(requests: ReadonlyArray<T>, lastSeen: string | null): T[] {
  if (!lastSeen) return [...requests];
  const seen = Date.parse(lastSeen);
  if (Number.isNaN(seen)) return [...requests];
  return requests.filter((request) => Date.parse(request.createdAt) > seen);
}

/** The newest date among them: what "Ver" stores as seen. */
export function newestCreatedAt(requests: ReadonlyArray<{ createdAt: string }>): string | null {
  let newest: string | null = null;
  for (const { createdAt } of requests) {
    if (!newest || Date.parse(createdAt) > Date.parse(newest)) newest = createdAt;
  }
  return newest;
}

export function contactsNotice(unseen: ReadonlyArray<{ name: string }>): PendingNotice | null {
  if (unseen.length === 0) return null;
  if (unseen.length === 1) {
    return { id: "contacts", lead: unseen[0]!.name, text: "te ha dejado su contacto", action: "Ver", href: "#contactos" };
  }
  return { id: "contacts", lead: null, text: `Te han dejado ${unseen.length} contactos`, action: "Ver", href: "#contactos" };
}
