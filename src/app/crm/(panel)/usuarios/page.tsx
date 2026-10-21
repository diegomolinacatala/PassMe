import { UserListControls } from "@/components/admin/user-list-controls";
import { UsersTable } from "@/components/admin/users-table";
import { DataNotices, GeneratedAt, PageHeading, PeriodFilter } from "@/components/admin/crm-ui";
import { demoAdminRawData } from "@/lib/admin/demo";
import { periodStart } from "@/lib/admin/days";
import { formatNumber } from "@/lib/admin/format";
import { requireAdminSession } from "@/lib/admin/session";
import { parseAdminPeriod } from "@/lib/admin/stats";
import { buildUserRows, parseUserListQuery, selectUsers } from "@/lib/admin/users";
import { loadAdminRawData } from "@/lib/data/admin-stats";

export const metadata = { title: "Usuarios · CRM" };

/** Every PassMe account, searchable and sortable, with its activity in the period. */
export default async function CrmUsersPage({ searchParams }: PageProps<"/crm/usuarios">) {
  await requireAdminSession();
  const params = await searchParams;
  const days = parseAdminPeriod(params.d);
  const query = parseUserListQuery(params);
  const now = new Date();
  const raw = (await loadAdminRawData({ days, now })) ?? demoAdminRawData(now, days);
  const all = buildUserRows(raw, periodStart(now, days));
  const users = selectUsers(all, query, now.getTime());
  const keep = Object.fromEntries(
    Object.entries({ q: query.search, f: query.filter === "todos" ? "" : query.filter, orden: query.sort === "alta" ? "" : query.sort }).filter(
      ([, v]) => v !== "",
    ),
  );

  return (
    <>
      <PageHeading eyebrow="Usuarios" title="Quién usa" accent="PassMe." aside={<PeriodFilter days={days} path="/crm/usuarios" params={keep} />}>
        <p>
          {users.length === all.length
            ? `${formatNumber(all.length)} ${all.length === 1 ? "cuenta" : "cuentas"}`
            : `${formatNumber(users.length)} de ${formatNumber(all.length)} cuentas`}{" "}
          · visitas, guardados, clics, contactos y reuniones de los últimos {days} días · <GeneratedAt at={now} />
        </p>
      </PageHeading>

      <DataNotices demo={raw.demo} warnings={raw.warnings} insightsPending={raw.insightsPending} />

      <div className="mt-8 space-y-4">
        <UserListControls query={query} days={days} />
        <UsersTable users={users} days={days} />
      </div>
    </>
  );
}
