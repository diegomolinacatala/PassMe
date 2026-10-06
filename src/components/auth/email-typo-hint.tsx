"use client";

import { suggestEmailFix } from "@/lib/auth/email-typos";
import { cn } from "@/lib/cn";

interface EmailTypoHintProps {
  email: string;
  /** Called with the corrected address. */
  onFix: (email: string) => void;
  className?: string;
}

/** «¿Querías decir carlos@gmail.com?» under an email field, before anything is sent. */
export function EmailTypoHint({ email, onFix, className }: EmailTypoHintProps) {
  const suggestion = suggestEmailFix(email);
  return (
    // Always in the page (empty and out of the flow until needed): screen readers hear it appear.
    <div aria-live="polite" className={suggestion ? undefined : "sr-only"}>
      {suggestion ? (
        <p className={cn("flex flex-wrap items-center gap-x-2 text-sm text-ink-soft", className)}>
          <span className="[overflow-wrap:anywhere]">
            ¿Querías decir {suggestion.local}@<strong className="font-semibold text-ink">{suggestion.domain}</strong>?
          </span>
          <button
            type="button"
            onClick={() => onFix(suggestion.email)}
            className="inline-flex min-h-11 items-center font-medium text-signal-deep underline underline-offset-4 hover:text-ink"
          >
            Sí, corregir
          </button>
        </p>
      ) : null}
    </div>
  );
}
