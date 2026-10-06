"use client";

import { CircleAlert } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type InputSize = "md" | "sm" | "multiline";

/**
 * The one look for text inputs: 16 px text (iOS doesn't zoom in), a border at
 * ≥ 3:1 (`field-border`) and a visible signal outline on focus.
 * `md` is 48 px high; `sm` (44 px) is for compact rows such as the contact details editor.
 */
export function inputClasses({ size = "md", className }: { size?: InputSize; className?: string } = {}): string {
  return cn(
    "w-full rounded-control border border-field-border bg-card px-3.5 text-base text-ink placeholder:text-muted/70",
    "transition-[border-color] duration-200 hover:border-ink focus:border-ink",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
    "read-only:opacity-60 aria-[invalid=true]:border-danger",
    size === "md" && "h-12",
    size === "sm" && "h-11",
    size === "multiline" && "min-h-24 resize-y py-2.5 leading-relaxed",
    className,
  );
}

interface InlineErrorProps {
  id?: string;
  children: ReactNode;
  /** Announce it as soon as it appears (errors shown on blur or after an answer). */
  live?: boolean;
  className?: string;
}

/** A field's error: icon + text, never color alone. */
export function InlineError({ id, children, live, className }: InlineErrorProps) {
  return (
    <p id={id} role={live ? "alert" : undefined} className={cn("flex items-start gap-1.5 text-sm text-danger", className)}>
      <CircleAlert className="mt-[0.2em] size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export interface FieldControlProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
}

interface FieldProps {
  label: ReactNode;
  /** Marks the field as optional (the convention: only optional fields are marked). */
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  /** Announce the error as it appears (validation on blur). */
  liveError?: boolean;
  /** Extra ids for aria-describedby (e.g. a group error). */
  describedBy?: string;
  /** Something on the label's line, right-aligned (e.g. a character counter). */
  aside?: ReactNode;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
}

/** Label, optional mark, hint and error around one control, all wired up for assistive tech. */
export function Field({ label, optional, hint, error, liveError, describedBy, aside, className, children }: FieldProps) {
  const id = useId();
  const described = [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null, describedBy].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <label htmlFor={id} className="text-sm font-medium text-ink-soft">
          {label}
        </label>
        {optional || aside ? (
          <span className="flex items-baseline gap-3 text-sm text-muted">
            {optional ? <span>Opcional</span> : null}
            {aside}
          </span>
        ) : null}
      </div>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": described })}
      {error ? (
        <InlineError id={`${id}-error`} live={liveError} className="mt-1.5">
          {error}
        </InlineError>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
