import { ActivityFeed } from "@/components/admin/activity-feed";
import { DataNotices, GeneratedAt, PageHeading, PeriodFilter } from "@/components/admin/crm-ui";
import { buildActivity, parseActivityFilter } from "@/lib/admin/activity";
import { demoAdminRawData } from "@/lib/admin/demo";
import { requireAdminSession } from "@/lib/admin/session";
import { parseAdminPeriod } from "@/lib/admin/stats";
import { loadAdminRawData } from "@/lib/data/admin-stats";

export const metadata = { title: "Actividad · CRM" };

/** What happened across PassMe, newest first: sign-ups, passes, visits and what visitors did. */
export default async function CrmActivityPage({ searchParams }: PageProps<"/crm/actividad">) {
  await requireAdminSession();
  const params = await searchParams;
  const days = parseAdminPeriod(params.d ?? "7");
  const filter = parseActivityFilter(params.tipo);
  const now = new Date();
  const raw = (await loadAdminRawData({ days, now })) ?? demoAdminRawData(now, days);
  const { items, total } = buildActivity(raw, { days, now, filter });

  return (
    <>
      <PageHeading
        eyebrow="Actividad"
        title="Qué está"
        accent="pasando."
        aside={<PeriodFilter days={days} path="/crm/actividad" params={filter === "todo" ? {} : { tipo: filter }} />}
      >
        <p>
          <GeneratedAt at={now} days={days} />
        </p>
      </PageHeading>
      <DataNotices demo={raw.demo} warnings={raw.warnings} insightsPending={raw.insightsPending} />
      <div className="mt-8">
        <ActivityFeed items={items} total={total} filter={filter} days={days} />
      </div>
    </>
  );
}
