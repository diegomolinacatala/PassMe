"use client";

import { useId, type ReactNode } from "react";
import { Field, inputClasses } from "@/components/ui/field";
import { cn } from "@/lib/cn";

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
    <section aria-labelledby={id} className="rounded-panel border hairline bg-card/70 p-5 sm:p-7">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-signal-deep">{number}</p>
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
  optional?: boolean;
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
  optional,
}: TextFieldProps) {
  const nearLimit = value.length > maxLength * 0.8;
  const counter = (
    <span className={cn("font-mono text-mark tabular-nums", nearLimit ? "text-signal-deep" : "text-muted")} aria-hidden="true">
      {value.length}/{maxLength}
    </span>
  );

  return (
    // Errors show on blur, so they're announced as they appear.
    <Field label={label} optional={optional} hint={hint} error={error} liveError aside={counter} className={className}>
      {(props) =>
        multiline ? (
          <textarea
            {...props}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            maxLength={maxLength}
            placeholder={placeholder}
            required={required}
            rows={3}
            className={inputClasses({ size: "multiline" })}
          />
        ) : (
          <div className="relative">
            {prefix ? (
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center font-mono text-sm text-muted">
                {prefix}
              </span>
            ) : null}
            <input
              {...props}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onBlur}
              maxLength={maxLength}
              placeholder={placeholder}
              autoComplete={autoComplete}
              required={required}
              className={inputClasses()}
              style={prefix ? { paddingLeft: `calc(0.875rem + ${prefix.length}ch)` } : undefined}
            />
          </div>
        )
      }
    </Field>
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
