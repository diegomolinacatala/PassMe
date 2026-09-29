"use client";

import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { checkSlugAction, type SlugCheckResult } from "@/app/dashboard/actions";
import { checkSlug, SLUG_ERRORS, SLUG_MAX_LENGTH } from "@/lib/card/slug";
import { cn } from "@/lib/cn";
import { INPUT_CLASSES } from "./fields";

const DEBOUNCE_MS = 450;

interface SlugFieldProps {
  value: string;
  savedValue: string;
  siteHost: string;
  demo: boolean;
  serverError?: string;
  /** Handle suggested from the owner's name while the card still has a placeholder one. */
  suggestion?: string | null;
  onChange: (value: string) => void;
}

export function SlugField({ value, savedValue, siteHost, demo, serverError, suggestion, onChange }: SlugFieldProps) {
  const id = useId();
  const [remote, setRemote] = useState<{ slug: string; result: SlugCheckResult } | null>(null);

  // The saved slug is valid by definition (and "demo" is reserved on purpose in demo mode).
  const unchanged = value === savedValue;
  const local = unchanged ? ({ ok: true } as const) : checkSlug(value);
  const needsRemote = !demo && local.ok && !unchanged;

  useEffect(() => {
    if (!needsRemote) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await checkSlugAction(value);
      if (!cancelled) setRemote({ slug: value, result });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, needsRemote]);

  const remoteForValue = remote?.slug === value ? remote.result : null;
  const status: "idle" | "checking" | "ok" | "error" = !local.ok
    ? "error"
    : !needsRemote
      ? "idle"
      : !remoteForValue
        ? "checking"
        : remoteForValue.status === "available"
          ? "ok"
          : "error";

  const message = !local.ok
    ? SLUG_ERRORS[local.reason]
    : status === "error"
      ? remoteForValue?.message
      : status === "ok"
        ? "¡Disponible!"
        : serverError;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-soft">
        Enlace de tu tarjeta
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center font-mono text-sm text-muted">
          {siteHost}/u/
        </span>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
          maxLength={SLUG_MAX_LENGTH}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={status === "error" || Boolean(serverError)}
          aria-describedby={`${id}-msg`}
          className={cn(INPUT_CLASSES, "h-11 pr-10 font-mono text-sm")}
          style={{ paddingLeft: `calc(0.875rem + ${siteHost.length + 3}ch)` }}
        />
        <span className="absolute inset-y-0 right-3 flex items-center" aria-hidden="true">
          {status === "checking" ? <LoaderCircle className="size-4 animate-spin text-muted" /> : null}
          {status === "ok" ? <CircleCheck className="size-4 text-ok" /> : null}
          {status === "error" ? <CircleX className="size-4 text-danger" /> : null}
        </span>
      </div>
      <p
        id={`${id}-msg`}
        aria-live="polite"
        className={cn("mt-1.5 text-xs", status === "error" || serverError ? "text-danger" : status === "ok" ? "text-ok" : "text-muted")}
      >
        {message ?? "Si lo cambias, el enlace antiguo seguirá llevando a tu tarjeta y los pases se actualizan solos."}
      </p>
      {suggestion && suggestion !== value ? (
        <button
          type="button"
          onClick={() => onChange(suggestion)}
          className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-signal-wash px-3 py-1 text-xs text-signal-deep transition-colors hover:bg-glow"
        >
          <span className="shrink-0">Usar</span>
          <span className="truncate font-mono">
            {siteHost}/u/{suggestion}
          </span>
        </button>
      ) : null}
    </div>
  );
}
