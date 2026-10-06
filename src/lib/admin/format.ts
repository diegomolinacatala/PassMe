/** Formatting for the private dashboard: Spanish, Madrid time. No imports: the chart (a client component) uses it. */

/** Days are counted in the owner's time zone, not UTC. */
export const ADMIN_TIME_ZONE = "Europe/Madrid";

const numberFormat = new Intl.NumberFormat("es-ES");

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** "38 %", or "—" when there's nothing to divide by. */
export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)} %`;
}

/** Round an axis up to 1, 2 or 5 × 10ⁿ so the ticks are clean numbers (never below 4). */
export function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Noon UTC keeps a calendar day on the same date in any European time zone. */
function dayDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

const shortDay = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: ADMIN_TIME_ZONE,
});
const clock = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: ADMIN_TIME_ZONE });

/** "6 oct" for a YYYY-MM-DD day. */
export function formatShortDay(day: string): string {
  return shortDay.format(dayDate(day)).replace(".", "");
}

/** "lun, 6 oct" for a YYYY-MM-DD day. */
export function formatLongDay(day: string): string {
  return longDay.format(dayDate(day)).replace(/\./g, "");
}

/** "6 oct 2026" for an instant. */
export function formatDate(instant: string | null): string {
  return instant ? dateTime.format(new Date(instant)).replace(".", "") : "—";
}

/** "12:04" in Madrid. */
export function formatClock(instant: Date): string {
  return clock.format(instant);
}
