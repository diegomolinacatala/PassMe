import { WalletView } from "@/components/admin/wallet-view";
import { demoAdminRawData } from "@/lib/admin/demo";
import { requireAdminSession } from "@/lib/admin/session";
import { parseAdminPeriod } from "@/lib/admin/stats";
import { buildWalletOverview } from "@/lib/admin/wallet";
import { loadAdminRawData } from "@/lib/data/admin-stats";

export const metadata = { title: "Wallet · CRM" };

/** Who has their card in Apple Wallet now, who tried, and who hasn't yet. */
export default async function CrmWalletPage({ searchParams }: PageProps<"/crm/wallet">) {
  await requireAdminSession();
  const days = parseAdminPeriod((await searchParams).d);
  const now = new Date();
  const raw = (await loadAdminRawData({ days, now })) ?? demoAdminRawData(now, days);
  return <WalletView overview={buildWalletOverview(raw, { days, now })} raw={raw} generatedAt={now} />;
}
