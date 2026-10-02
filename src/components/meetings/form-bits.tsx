"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Same input look as "Te dejo mi contacto". 16px text: iOS doesn't zoom into the field. */
export const MEETING_INPUT =
  "w-full rounded-xl border border-line bg-paper/60 px-3.5 text-base text-ink placeholder:text-muted/60 outline-none transition-[border-color,box-shadow] duration-200 hover:border-line-strong focus:border-ink focus:bg-card focus:shadow-[0_0_0_4px_rgb(20_20_20/0.06)] aria-[invalid=true]:border-danger";

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}

export function Field({ label, error, hint, optional, children }: FieldProps) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink-soft">
        {label}
        {optional ? <span className="font-mono text-[10px] tracking-wide text-muted uppercase">Opcional</span> : null}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentOption<T>>;
  onChange: (value: T) => void;
  /** Icon above the label: long labels fit three across on a phone. */
  stacked?: boolean;
}

/** A row of mutually exclusive choices (radio semantics, 44 px targets). */
export function Segmented<T extends string | number>({ label, value, options, onChange, stacked }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div>
      <p id={id} className="mb-1.5 text-sm font-medium text-ink-soft">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={id} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-paper-deep/70 p-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex items-center justify-center rounded-xl px-2 font-medium transition-[background-color,color,box-shadow] duration-200",
                stacked ? "min-h-14 flex-col gap-1 py-1.5 text-[13px] leading-tight" : "min-h-11 gap-1.5 text-sm",
                selected ? "bg-card text-ink shadow-soft" : "text-muted hover:text-ink",
              )}
            >
              {option.icon}
              <span className={stacked ? "text-center" : "truncate"}>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
