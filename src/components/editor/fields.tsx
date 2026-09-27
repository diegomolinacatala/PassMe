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
          <p className="font-mono text-[11px] tracking-[0.16em] text-signal">{number}</p>
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
          {required ? <span className="text-signal"> *</span> : null}
        </label>
        <span className={cn("font-mono text-[10px] tabular-nums", nearLimit ? "text-signal" : "text-muted/70")} aria-hidden="true">
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

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}

export function Switch({ checked, onChange, label, className, size = "md" }: SwitchProps) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative shrink-0 rounded-full transition-colors duration-300",
        sm ? "h-5 w-9" : "h-6 w-11",
        checked ? "bg-ink" : "bg-line-strong/70",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 rounded-full bg-card shadow-sm transition-transform duration-300 ease-[var(--ease-spring)]",
          sm ? "size-4" : "size-5",
          checked && (sm ? "translate-x-4" : "translate-x-5"),
        )}
      />
    </button>
  );
}
