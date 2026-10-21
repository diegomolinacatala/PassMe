import type { ContactRequest } from "@/lib/card/contact-info";
import type { Meeting } from "@/lib/meetings/model";

/**
 * "Mis contactos" (/crm/contactos): the people who left their details on the
 * signed-in owner's own card or proposed them a meeting, one entry per person.
 * The rows come from the owner's session (row-level security), exactly what
 * their editor shows; never someone else's.
 */

export type LeadMeeting = Pick<Meeting, "id" | "status" | "format" | "topic" | "source" | "createdAt" | "confirmedStart" | "guest">;

export interface LeadTouch {
  id: string;
  kind: "contact" | "meeting";
  at: string;
  source: string;
  /** Their message, or the meeting's topic. */
  note: string;
  /** Meetings only. */
  status?: string;
  format?: string;
  confirmedStart?: string | null;
}

export interface Lead {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string;
  firstAt: string;
  lastAt: string;
  /** Newest first. */
  touches: LeadTouch[];
}

interface Sighting {
  name: string;
  email: string | null;
  phone: string | null;
  company: string;
  touch: LeadTouch;
}

/** The same person by email, else by phone; without either, each entry stands alone. */
function personKey(s: Sighting): string {
  if (s.email) return `email:${s.email.trim().toLowerCase()}`;
  if (s.phone) return `phone:${s.phone.replace(/[^\d+]/g, "")}`;
  return `${s.touch.kind}:${s.touch.id}`;
}

export function buildLeads(requests: readonly ContactRequest[], meetings: readonly LeadMeeting[]): Lead[] {
  const sightings: Sighting[] = [
    ...requests.map((r) => ({
      name: r.name,
      email: r.email,
      phone: r.phone,
      company: r.company,
      touch: { id: r.id, kind: "contact" as const, at: r.createdAt, source: r.source, note: r.message },
    })),
    ...meetings.map((m) => ({
      name: m.guest.name,
      email: m.guest.email || null,
      phone: m.guest.phone,
      company: m.guest.company,
      touch: {
        id: m.id,
        kind: "meeting" as const,
        at: m.createdAt,
        source: m.source,
        note: m.topic,
        status: m.status,
        format: m.format,
        confirmedStart: m.confirmedStart,
      },
    })),
  ].sort((a, b) => Date.parse(b.touch.at) - Date.parse(a.touch.at));

  // Newest first, so the first sighting of each person carries their latest name and details.
  const leads = new Map<string, Lead>();
  for (const s of sightings) {
    const key = personKey(s);
    const lead = leads.get(key);
    if (!lead) {
      leads.set(key, { key, name: s.name, email: s.email, phone: s.phone, company: s.company, firstAt: s.touch.at, lastAt: s.touch.at, touches: [s.touch] });
      continue;
    }
    leads.set(key, {
      ...lead,
      email: lead.email ?? s.email,
      phone: lead.phone ?? s.phone,
      company: lead.company || s.company,
      firstAt: s.touch.at,
      touches: [...lead.touches, s.touch],
    });
  }
  return [...leads.values()];
}
