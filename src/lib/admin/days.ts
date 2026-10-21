import { ADMIN_TIME_ZONE } from "./format";

/** Calendar helpers for the CRM: days are counted in Madrid, not UTC. */

export const DAY_MS = 86_400_000;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ADMIN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD of an instant, in Madrid. */
export function dayKey(instant: string | Date): string {
  return dayFormatter.format(typeof instant === "string" ? new Date(instant) : instant);
}

export function shiftDay(day: string, offset: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + offset)).toISOString().slice(0, 10);
}

export function mondayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

const madridHour = new Intl.DateTimeFormat("en-GB", { timeZone: ADMIN_TIME_ZONE, hour: "2-digit", hourCycle: "h23" });

/**
 * The instant a Madrid calendar day (YYYY-MM-DD) starts: 22:00 or 23:00 UTC
 * the day before. Clocks change at 01:00 UTC, after the UTC midnight read here.
 */
export function startOfDay(day: string): number {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  return utcMidnight - Number(madridHour.format(utcMidnight)) * 3_600_000;
}

/** Where a period of `days` calendar days ending today starts: the charts' first day, so totals match them. */
export function periodStart(now: Date, days: number): number {
  return startOfDay(shiftDay(dayKey(now), 1 - days));
}

/** The first value of a search param that may come repeated (?d=7&d=30). */
export function firstParam(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** The last `days` calendar days, oldest first, ending today. */
export function lastDays(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => shiftDay(today, i - days + 1));
}

export function countBy<T>(rows: readonly T[], key: (row: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** The latest of some instants (ISO strings), or null when there are none. */
export function latest(instants: Iterable<string | null>): string | null {
  let best: string | null = null;
  for (const instant of instants) {
    if (instant && (best === null || Date.parse(instant) > Date.parse(best))) best = instant;
  }
  return best;
}

/** The earliest of some instants (ISO strings), or null when there are none. */
export function earliest(instants: Iterable<string | null>): string | null {
  let best: string | null = null;
  for (const instant of instants) {
    if (instant && (best === null || Date.parse(instant) < Date.parse(best))) best = instant;
  }
  return best;
}
