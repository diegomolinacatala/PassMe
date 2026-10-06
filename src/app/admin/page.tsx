import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getAdminCredentials } from "@/lib/admin/auth";
import { demoAdminRawData } from "@/lib/admin/demo";
import { hasAdminSession } from "@/lib/admin/session";
import { buildAdminStats, parseAdminPeriod } from "@/lib/admin/stats";
import { loadAdminRawData } from "@/lib/data/admin-stats";

export const metadata: Metadata = { title: "Panel privado", robots: { index: false, follow: false } };

/**
 * Private product stats. Off (404) unless ADMIN_USERNAME and ADMIN_PASSWORD
 * are set; behind its own signed cookie, not a PassMe account.
 */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const credentials = getAdminCredentials();
  if (!credentials) notFound();
  if (!(await hasAdminSession(credentials))) redirect("/admin/entrar");

  const days = parseAdminPeriod((await searchParams).d);
  const now = new Date();
  const raw = (await loadAdminRawData(days, now)) ?? demoAdminRawData(now, days);
  const stats = buildAdminStats(raw, { days, now });

  return <AdminDashboard stats={stats} generatedAt={now} />;
}
