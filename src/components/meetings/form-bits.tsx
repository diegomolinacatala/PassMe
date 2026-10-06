"use client";

import { useId, type ReactNode } from "react";
import { CHOICE_FOCUS, CHOICE_INPUT } from "@/components/ui/choice";
import { cn } from "@/lib/cn";

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

/** A row of mutually exclusive choices: native radios (arrow keys), 44 px targets, the chosen one in ink. */
export function Segmented<T extends string | number>({ label, value, options, onChange, stacked }: SegmentedProps<T>) {
  const name = `segmented-${useId()}`;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-soft">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-paper-deep/70 p-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={String(option.value)}
              className={cn(
                "relative flex items-center justify-center rounded-control px-2 text-center font-medium transition-[background-color,color] duration-200",
                stacked ? "min-h-14 flex-col gap-1 py-1.5 text-small leading-tight" : "min-h-11 gap-1.5 py-1 text-sm",
                selected ? "bg-ink text-paper" : "text-ink-soft hover:bg-card/80 hover:text-ink",
                CHOICE_FOCUS,
              )}
            >
              <input
                type="radio"
                name={name}
                value={String(option.value)}
                checked={selected}
                onChange={() => onChange(option.value)}
                className={CHOICE_INPUT}
              />
              {option.icon}
              <span className="min-w-0 text-balance">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
