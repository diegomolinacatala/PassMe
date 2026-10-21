import { LeadsView, type LeadsState } from "@/components/admin/leads-view";
import { demoAdminRawData, demoOwnLeads, demoProfileId } from "@/lib/admin/demo";
import { buildLeads } from "@/lib/admin/leads";
import { requireAdminSession } from "@/lib/admin/session";
import { buildUserDetail, USER_DETAIL_DAYS } from "@/lib/admin/user-detail";
import { loadAdminRawData } from "@/lib/data/admin-stats";
import { findOwnerCard } from "@/lib/data/cards";
import { listOwnContactRequests } from "@/lib/data/contact-requests";
import { listOwnMeetings } from "@/lib/data/meetings";
import { log } from "@/lib/log";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export const metadata = { title: "Mis contactos · CRM" };

/**
 * The people who reached out through the owner's own card. Read with their
 * PassMe session, like the editor (row-level security): the CRM login alone
 * never shows anyone's contacts.
 */
async function loadLeads(now: Date): Promise<LeadsState> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    const raw = demoAdminRawData(now, USER_DETAIL_DAYS);
    const { requests, meetings } = demoOwnLeads(now);
    const own = raw.profiles[0]!;
    return {
      kind: "ready",
      demo: true,
      email: raw.users[0]!.email,
      card: { slug: own.slug, name: own.fullName },
      leads: buildLeads(requests, meetings),
      failed: false,
      detail: buildUserDetail(raw, demoProfileId(0), now),
    };
  }

  const user = await getSessionUser(supabase);
  if (!user) return { kind: "signed-out" };
  const [card, contacts, meetings, raw] = await Promise.all([
    // Without the card the people still show; only the card's own numbers go missing.
    findOwnerCard(supabase, user.id).catch((error: unknown) => {
      log.warn("crm: own card lookup failed", {}, error);
      return "failed" as const;
    }),
    listOwnContactRequests(supabase),
    listOwnMeetings(supabase),
    loadAdminRawData({ days: USER_DETAIL_DAYS, now, profileId: user.id }),
  ]);
  const own = card === "failed" ? null : card;
  return {
    kind: "ready",
    demo: false,
    email: user.email,
    card: own ? { slug: own.slug, name: own.fullName } : null,
    leads: buildLeads(contacts.requests, meetings.meetings),
    failed: Boolean(card === "failed" || contacts.failed || meetings.failed),
    detail: own && raw ? buildUserDetail(raw, user.id, now) : null,
  };
}

export default async function CrmContactsPage() {
  await requireAdminSession();
  return <LeadsView state={await loadLeads(new Date())} />;
}
