import { notFound } from "next/navigation";
import { UserDetailView } from "@/components/admin/user-detail-view";
import { demoAdminRawData } from "@/lib/admin/demo";
import { requireAdminSession } from "@/lib/admin/session";
import { buildUserDetail, USER_DETAIL_DAYS } from "@/lib/admin/user-detail";
import { loadAdminRawData } from "@/lib/data/admin-stats";
import { isUuid } from "@/lib/data/wallet";

export const metadata = { title: "Ficha · CRM" };

/** Everything PassMe knows about one account (and, of what others left them, only how much). */
export default async function CrmUserPage({ params }: PageProps<"/crm/usuarios/[id]">) {
  await requireAdminSession();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const now = new Date();
  const raw = (await loadAdminRawData({ days: USER_DETAIL_DAYS, now, profileId: id })) ?? demoAdminRawData(now, USER_DETAIL_DAYS);
  const detail = buildUserDetail(raw, id, now);
  if (!detail) notFound();

  return <UserDetailView detail={detail} demo={raw.demo} warnings={raw.warnings} insightsPending={raw.insightsPending} />;
}
