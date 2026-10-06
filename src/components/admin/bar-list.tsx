import { formatNumber } from "@/lib/admin/format";

export interface BarListRow {
  label: string;
  value: number;
  /** Muted text after the value ("38 %"). */
  note?: string;
}

interface BarListProps {
  rows: BarListRow[];
  /** What a full bar means; defaults to the largest value. */
  max?: number;
  empty?: string;
}

/** Horizontal bars, one hue, each labelled with its value: nothing hides behind a hover. */
export function BarList({ rows, max, empty = "Aún no hay datos." }: BarListProps) {
  const scale = Math.max(1, max ?? 0, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;

  return (
    <ul className="space-y-3.5">
      {rows.map((row) => (
        <li key={row.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-ink-soft">{row.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold text-ink">{formatNumber(row.value)}</span>
              {row.note ? <span className="ml-2 text-muted">{row.note}</span> : null}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line/60" aria-hidden>
            <div
              className="h-full rounded-full bg-ink-soft"
              style={{ width: row.value === 0 ? 0 : `${Math.max(1.5, (row.value / scale) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
