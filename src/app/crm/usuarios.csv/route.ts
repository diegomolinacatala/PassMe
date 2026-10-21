import { NextResponse, type NextRequest } from "next/server";
import { demoAdminRawData } from "@/lib/admin/demo";
import { dayKey, periodStart } from "@/lib/admin/days";
import { adminSessionStatus, CRM_LOGIN_PATH } from "@/lib/admin/session";
import { parseAdminPeriod } from "@/lib/admin/stats";
import { buildUserRows, parseUserListQuery, selectUsers, usersToCsv } from "@/lib/admin/users";
import { loadAdminRawData } from "@/lib/data/admin-stats";
import { getSiteUrl } from "@/lib/env";
import { isNavigation } from "@/lib/pass/http";

export const runtime = "nodejs";

const PRIVATE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

/**
 * The CRM's user list as a spreadsheet, with the same search, filter, order
 * and period as the page that links here. Same session check as every CRM page.
 */
export async function GET(request: NextRequest) {
  const status = await adminSessionStatus();
  if (status === "off") return new Response("Not found", { status: 404, headers: PRIVATE });
  if (status === "out") {
    if (isNavigation(request)) return NextResponse.redirect(new URL(CRM_LOGIN_PATH, request.url), { status: 303 });
    return new Response("Entra en el CRM para descargarlo.", { status: 401, headers: PRIVATE });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const days = parseAdminPeriod(params.d);
  const now = new Date();
  const raw = (await loadAdminRawData({ days, now })) ?? demoAdminRawData(now, days);
  if (raw.failed) {
    // A file missing rows would look complete once opened in a spreadsheet.
    return new Response(`No se han podido cargar todos los datos: ${raw.warnings.join(" ")} Inténtalo de nuevo en un momento.`, {
      status: 503,
      headers: { ...PRIVATE, "Content-Type": "text/plain; charset=utf-8", "Retry-After": "10" },
    });
  }

  const users = selectUsers(buildUserRows(raw, periodStart(now, days)), parseUserListQuery(params), now.getTime());
  return new Response(usersToCsv(users, days, getSiteUrl()), {
    headers: {
      ...PRIVATE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="passme-usuarios-${dayKey(now)}.csv"`,
    },
  });
}
