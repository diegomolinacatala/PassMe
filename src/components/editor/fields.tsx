"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export const INPUT_CLASSES =
  "w-full rounded-xl border border-line bg-card px-3.5 text-[0.95rem] text-ink placeholder:text-muted/60 outline-none transition-[border-color,box-shadow] duration-200 hover:border-line-strong focus:border-ink focus:shadow-[0_0_0_4px_rgb(20_20_20/0.06)] aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_4px_rgb(180_35_24/0.1)]";

interface SectionProps {
  number: string;
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}

/** Numbered editor section — the "01 / Identidad" rhythm used across the product. */
export function Section({ number, title, description, children, aside }: SectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-[26px] border hairline bg-card/70 p-5 shadow-[0_1px_0_rgb(255_255_255/0.6)_inset] sm:p-7">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.16em] text-signal-deep">{number}</p>
          <h2 id={id} className="mt-1 font-display text-[1.9rem] leading-none tracking-tight">
            {title}
          </h2>
          {description ? <p className="mt-2 max-w-md text-sm text-muted">{description}</p> : null}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  maxLength: number;
  placeholder?: string;
  multiline?: boolean;
  autoComplete?: string;
  prefix?: string;
  className?: string;
  required?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  maxLength,
  placeholder,
  multiline,
  autoComplete,
  prefix,
  className,
  required,
}: TextFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const nearLimit = value.length > maxLength * 0.8;

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink-soft">
          {label}
          {required ? <span className="text-signal-deep"> *</span> : null}
        </label>
        <span className={cn("font-mono text-[10px] tabular-nums", nearLimit ? "text-signal-deep" : "text-muted/70")} aria-hidden="true">
          {value.length}/{maxLength}
        </span>
      </div>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          maxLength={maxLength}
          placeholder={placeholder}
          rows={3}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(INPUT_CLASSES, "min-h-24 resize-y py-2.5 leading-relaxed")}
        />
      ) : (
        <div className="relative">
          {prefix ? (
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center font-mono text-sm text-muted">
              {prefix}
            </span>
          ) : null}
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            maxLength={maxLength}
            placeholder={placeholder}
            autoComplete={autoComplete}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={cn(INPUT_CLASSES, "h-11")}
            style={prefix ? { paddingLeft: `calc(0.875rem + ${prefix.length}ch)` } : undefined}
          />
        </div>
      )}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface SwitchRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  className?: string;
}

/**
 * A setting with its explanation: the whole row is the switch, and its name is
 * exactly the visible label (the explanation is its description).
 */
export function SwitchRow({ checked, onChange, label, description, className }: SwitchRowProps) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={description ? `${id}-description` : undefined}
      onClick={() => onChange(!checked)}
      className={cn("group flex w-full items-start justify-between gap-4 text-left", className)}
    >
      <span className="min-w-0">
        <span id={`${id}-label`} className="block text-sm font-medium text-ink-soft">
          {label}
        </span>
        {description ? (
          <span id={`${id}-description`} className="mt-1 block max-w-md text-sm text-muted">
            {description}
          </span>
        ) : null}
      </span>
      <SwitchTrack checked={checked} />
    </button>
  );
}

/** The visual pill of a switch (the control itself is its parent). */
function SwitchTrack({ checked, size = "md" }: { checked: boolean; size?: "sm" | "md" }) {
  const sm = size === "sm";
  return (
    <span
      aria-hidden
      className={cn(
        "relative mt-0.5 shrink-0 rounded-full transition-colors duration-300 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-signal",
        sm ? "h-5 w-9" : "h-6 w-11",
        // Off: a visible outline (≥ 3:1), not a pale fill.
        checked ? "bg-ink" : "border-2 border-muted bg-transparent",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 rounded-full transition-transform duration-300 ease-[var(--ease-spring)]",
          checked ? cn("bg-card shadow-sm", sm ? "size-4 translate-x-4" : "size-5 translate-x-5") : cn("bg-muted", sm ? "size-3" : "size-4"),
        )}
      />
    </span>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}

/** A bare switch for compact rows; prefer SwitchRow when there's a visible label. */
export function Switch({ checked, onChange, label, className, size = "md" }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("group grid min-h-11 min-w-11 shrink-0 place-items-center", className)}
    >
      <SwitchTrack checked={checked} size={size} />
    </button>
  );
}
