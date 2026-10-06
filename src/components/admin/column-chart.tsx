"use client";

import { useState, type KeyboardEvent } from "react";
import { niceMax } from "@/lib/admin/format";
import { cn } from "@/lib/cn";

export interface ColumnDatum {
  key: string;
  /** Long label for the tooltip and the table ("lun 6 oct"). */
  label: string;
  /** Short label for the axis ("6 oct"). */
  axisLabel: string;
  value: number;
  /** Second line in the tooltip and the table ("QR 4 · enlace 2"). */
  detail?: string;
}

interface ColumnChartProps {
  data: ColumnDatum[];
  /** What the chart shows, for screen readers and the table ("Visitas por día"). */
  title: string;
  /** Plural unit after each value ("visitas"). */
  unit: string;
  tone?: "signal" | "ink";
}

const nf = new Intl.NumberFormat("es-ES");

/**
 * Columns from one baseline, one hue. Hover or arrow keys show a tooltip with
 * the value; the same numbers are in the table under "Ver los datos".
 */
export function ColumnChart({ data, title, unit, tone = "signal" }: ColumnChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const current = active === null ? null : data[active];
  const axisIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])];

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (data.length === 0) return;
    const last = data.length - 1;
    const moves: Record<string, number> = {
      ArrowLeft: Math.max(0, (active ?? last) - 1),
      ArrowRight: Math.min(last, (active ?? -1) + 1),
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]!);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  return (
    <figure>
      <div className="flex gap-2">
        {/* Y axis: 0, half and the top, in muted text. */}
        <div className="relative h-44 w-8 shrink-0 font-mono text-xs text-muted tabular-nums" aria-hidden>
          <span className="absolute -top-2 right-0">{nf.format(max)}</span>
          <span className="absolute top-1/2 right-0 -translate-y-1/2">{nf.format(max / 2)}</span>
          <span className="absolute right-0 -bottom-2">0</span>
        </div>

        <div className="relative min-w-0 flex-1">
          <div
            role="group"
            tabIndex={0}
            aria-label={`${title}. Usa las flechas para leer cada valor.`}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="relative flex h-44 items-end gap-[2px] rounded-sm border-b border-line-strong focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal"
          >
            {/* Hairline grid at the top and the middle. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-line" aria-hidden />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-line" aria-hidden />

            {data.map((d, i) => {
              const height = d.value === 0 ? 0 : Math.max(2, (d.value / max) * 100);
              return (
                <div
                  key={d.key}
                  onPointerEnter={() => setActive(i)}
                  className={cn("relative flex h-full min-w-0 flex-1 items-end justify-center", active === i && "bg-ink/[0.05]")}
                >
                  <div
                    className={cn(
                      "w-full max-w-6 rounded-t-[4px] transition-colors",
                      tone === "signal" ? "bg-signal" : "bg-ink-soft",
                      active === i && (tone === "signal" ? "bg-signal-deep" : "bg-ink"),
                    )}
                    style={{ height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>

          {current && active !== null ? (
            <div
              role="status"
              className="pointer-events-none absolute -top-3 z-10 w-max max-w-48 -translate-x-1/2 -translate-y-full rounded-control bg-ink px-3 py-2 text-paper shadow-soft"
              style={{ left: `clamp(4rem, ${((active + 0.5) / data.length) * 100}%, calc(100% - 4rem))` }}
            >
              <p className="text-base font-semibold tabular-nums">
                {nf.format(current.value)} <span className="text-sm font-normal text-paper/75">{unit}</span>
              </p>
              <p className="text-xs text-paper/75">{current.label}</p>
              {current.detail ? <p className="mt-0.5 text-xs text-paper/75">{current.detail}</p> : null}
            </div>
          ) : null}

          <div className="relative mt-2 h-4 font-mono text-xs text-muted" aria-hidden>
            {axisIndexes.map((i) => (
              <span
                key={i}
                className={cn(
                  "absolute whitespace-nowrap",
                  i === 0 ? "left-0" : i === data.length - 1 ? "right-0" : "-translate-x-1/2",
                )}
                style={i !== 0 && i !== data.length - 1 ? { left: `${((i + 0.5) / data.length) * 100}%` } : undefined}
              >
                {data[i]?.axisLabel}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">Ver los datos</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-control border hairline">
          <table className="w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-card text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Fecha</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{unit[0]!.toUpperCase() + unit.slice(1)}</th>
                <th scope="col" className="px-3 py-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.key} className="border-t hairline">
                  <td className="px-3 py-1.5">{d.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{nf.format(d.value)}</td>
                  <td className="px-3 py-1.5 text-muted">{d.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
