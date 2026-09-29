"use client";

import { useState, type Ref } from "react";
import { cleanCode } from "@/lib/auth/code";
import { cn } from "@/lib/cn";

interface CodeInputProps {
  name: string;
  length: number;
  value: string;
  onChange: (value: string) => void;
  /** Called once all the digits are in (typed, pasted or autofilled from Mail/SMS). */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  /** Keeps the digits (and submits them) but takes no typing, e.g. while they're checked. */
  readOnly?: boolean;
  invalid?: boolean;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
  label: string;
}

/**
 * One-time code field drawn as separate slots. It is a single real input on
 * top of the slots, so the keyboard's "from Mail" suggestion, pasting the whole
 * code and screen readers all behave as with any text field.
 */
export function CodeInput({
  name,
  length,
  value,
  onChange,
  onComplete,
  disabled,
  readOnly,
  invalid,
  describedBy,
  inputRef,
  label,
}: CodeInputProps) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);

  return (
    <div className="relative">
      <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden="true">
        {Array.from({ length }, (_, i) => {
          const digit = value[i] ?? "";
          const isActive = focused && !disabled && i === active;
          return (
            <span
              key={i}
              className={cn(
                "relative grid h-14 place-items-center rounded-xl border bg-card font-mono text-2xl font-medium text-ink transition-[border-color,box-shadow,transform] duration-200 sm:h-15",
                invalid ? "border-danger" : isActive ? "border-ink shadow-[0_0_0_4px_rgb(34_27_23/0.07)]" : "border-line",
                digit && !invalid && "border-line-strong",
                // A small gap in the middle makes 8 digits easy to read and compare (1234 5678).
                length === 8 && i === 4 && "ml-1.5 sm:ml-2.5",
              )}
            >
              {digit}
              {isActive && !digit ? <span className="h-6 w-px animate-pulse bg-ink" /> : null}
            </span>
          );
        })}
      </div>
      <input
        ref={inputRef}
        name={name}
        value={value}
        onChange={(e) => {
          const next = cleanCode(e.target.value).slice(0, length);
          onChange(next);
          if (next.length === length && next !== value) onComplete?.(next);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        // No maxLength: a pasted "Código: 12345678" must arrive whole before the digits are picked.
        disabled={disabled}
        readOnly={readOnly}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        spellCheck={false}
        // Invisible text on top of the slots; 16px+ keeps iOS from zooming in.
        className="absolute inset-0 h-full w-full cursor-text rounded-xl bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </div>
  );
}
