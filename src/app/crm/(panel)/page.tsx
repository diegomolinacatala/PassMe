import { CrmSummary } from "@/components/admin/crm-summary";
import { demoAdminRawData } from "@/lib/admin/demo";
import { requireAdminSession } from "@/lib/admin/session";
import { buildAdminStats, parseAdminPeriod } from "@/lib/admin/stats";
import { loadAdminRawData } from "@/lib/data/admin-stats";

export const metadata = { title: "Resumen · CRM" };

/** The CRM's front page: product-wide numbers for the last 7, 30 or 90 days. */
export default async function CrmSummaryPage({ searchParams }: PageProps<"/crm">) {
  await requireAdminSession();
  const days = parseAdminPeriod((await searchParams).d);
  const now = new Date();
  const raw = (await loadAdminRawData({ days, now })) ?? demoAdminRawData(now, days);
  return <CrmSummary stats={buildAdminStats(raw, { days, now })} generatedAt={now} />;
}
