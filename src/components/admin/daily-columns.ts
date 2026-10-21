import { formatLongDay, formatShortDay } from "@/lib/admin/format";
import type { DailyPoint } from "@/lib/admin/stats";
import type { ColumnDatum } from "./column-chart";

/** Views per day as chart columns, with where they came from in the tooltip. */
export function dailyColumns(points: DailyPoint[]): ColumnDatum[] {
  return points.map((d) => ({
    key: d.day,
    label: formatLongDay(d.day),
    axisLabel: formatShortDay(d.day),
    value: d.views,
    detail: d.views > 0 ? `QR ${d.qr} · enlace ${d.share} · directo ${d.views - d.qr - d.share}` : undefined,
  }));
}
