"use client";

import { CalendarClock, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import type { ContactRequest } from "@/lib/card/contact";
import {
  contactsNotice,
  meetingsNotice,
  needsOwnerAnswer,
  newestCreatedAt,
  seenCookie,
  unseenContacts,
  type PendingNotice,
} from "@/lib/pending";
import type { MeetingItem } from "./meetings-panel";

function Notice({ notice, onAction }: { notice: PendingNotice; onAction?: () => void }) {
  const Icon = notice.id === "meetings" ? CalendarClock : UserRoundPlus;
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-signal-wash/80 py-2 pr-2 pl-4">
      <Icon className="size-5 shrink-0 text-signal-deep" aria-hidden />
      <p className="min-w-0 flex-1 text-[0.95rem] text-ink">
        {notice.lead ? <strong className="font-semibold">{notice.lead}</strong> : null}
        {notice.lead ? " " : null}
        {notice.text}
      </p>
      <a href={notice.href} onClick={onAction} className={buttonClasses({ variant: "ink", size: "md", className: "shrink-0 px-4" })}>
        {notice.action}
      </a>
    </li>
  );
}

interface PendingNoticesProps {
  meetings: ReadonlyArray<MeetingItem>;
  contacts: ReadonlyArray<ContactRequest>;
  /** When "Ver" was last pressed in this browser (cookie, read on the server), or null. */
  contactsSeenAt: string | null;
}

/**
 * Above section 01: what's waiting for the owner — a proposal to answer, a
 * contact nobody has looked at — instead of 5,000 px further down.
 */
export function PendingNotices({ meetings, contacts, contactsSeenAt }: PendingNoticesProps) {
  const [lastSeen, setLastSeen] = useState(contactsSeenAt);

  const meetingNotice = meetingsNotice(
    meetings.filter(({ view }) => needsOwnerAnswer(view)).map(({ view, href }) => ({ name: view.guest.name, href })),
  );
  const contactNotice = contactsNotice(unseenContacts(contacts, lastSeen));
  if (!meetingNotice && !contactNotice) return null;

  function markContactsSeen() {
    const newest = newestCreatedAt(contacts) ?? new Date().toISOString();
    document.cookie = seenCookie(newest, window.location.protocol === "https:");
    setLastSeen(newest);
  }

  return (
    <section aria-label="Pendiente" className="mb-6">
      <ul className="space-y-2">
        {meetingNotice ? <Notice notice={meetingNotice} /> : null}
        {contactNotice ? <Notice notice={contactNotice} onAction={markContactsSeen} /> : null}
      </ul>
    </section>
  );
}
