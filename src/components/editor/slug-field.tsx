"use client";

import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { checkSlugAction, type SlugCheckResult } from "@/app/dashboard/actions";
import { isDemoSlugTaken } from "@/lib/card/demo";
import { checkSlug, normalizeSlugInput, slugAlternatives, SLUG_ERRORS, SLUG_MAX_LENGTH } from "@/lib/card/slug";
import { cn } from "@/lib/cn";
import { inputClasses } from "@/components/ui/field";

const DEBOUNCE_MS = 450;
/** Alternatives offered when a handle is taken, and how many checks that may cost at most. */
const ALTERNATIVES = 2;
const MAX_ALTERNATIVE_CHECKS = 4;

/** Demo mode has no database: a few handles play the part of "taken". */
async function demoCheck(slug: string): Promise<SlugCheckResult> {
  return isDemoSlugTaken(slug) ? { status: "taken", message: "Ese enlace ya está cogido." } : { status: "available" };
}

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
  const [alternatives, setAlternatives] = useState<{ slug: string; free: string[] } | null>(null);
  const check = demo ? demoCheck : checkSlugAction;

  // The saved slug is valid by definition (and "demo" is reserved on purpose in demo mode).
  const unchanged = value === savedValue;
  const local = unchanged ? ({ ok: true } as const) : checkSlug(value);
  const needsRemote = local.ok && !unchanged;

  useEffect(() => {
    if (!needsRemote) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await check(value);
      if (!cancelled) setRemote({ slug: value, result });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [check, value, needsRemote]);

  const remoteForValue = remote?.slug === value ? remote.result : null;
  const taken = remoteForValue?.status === "taken";

  // Taken: look for two free ones, one by one and with a small budget (each check is a request).
  useEffect(() => {
    if (!taken) return;
    let cancelled = false;
    (async () => {
      const free: string[] = [];
      for (const candidate of slugAlternatives(value).slice(0, MAX_ALTERNATIVE_CHECKS)) {
        if (cancelled || free.length >= ALTERNATIVES) break;
        const result = await check(candidate).catch(() => null);
        if (result?.status === "available") free.push(candidate);
      }
      if (!cancelled) setAlternatives({ slug: value, free });
    })();
    return () => {
      cancelled = true;
    };
  }, [check, taken, value]);

  const offered = taken && alternatives?.slug === value ? alternatives.free : [];
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
        {/* With a large system font the prefix may not fit: it's cut with "…" rather than pushing the page sideways. */}
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex max-w-[calc(65%-0.875rem)] items-center font-mono text-sm text-muted">
          <span className="truncate">{siteHost}/u/</span>
        </span>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(normalizeSlugInput(e.target.value))}
          maxLength={SLUG_MAX_LENGTH}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={status === "error" || Boolean(serverError)}
          aria-describedby={`${id}-msg`}
          className={inputClasses({ className: "pr-10 font-mono" })}
          // The prefix is text-sm (0.875 of the input's size): its width in the input's ch, capped like the prefix.
          style={{ paddingLeft: `min(calc(0.875rem + ${((siteHost.length + 3) * 0.875).toFixed(2)}ch + 2px), 65%)` }}
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
        {taken ? "Ese ya está cogido." : (message ?? "Si lo cambias, el enlace antiguo seguirá llevando a tu tarjeta y los pases se actualizan solos.")}
        {offered.length > 0 ? ` ¿Te vale ${offered.join(" o ")}?` : null}
      </p>
      {offered.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {offered.map((alternative) => (
            <button
              key={alternative}
              type="button"
              onClick={() => onChange(alternative)}
              aria-label={`Usar ${alternative}`}
              className="inline-flex min-h-11 max-w-full items-center rounded-full border border-field-border bg-card px-3.5 font-mono text-sm text-ink transition-colors hover:border-ink"
            >
              <span className="truncate">{alternative}</span>
            </button>
          ))}
        </div>
      ) : null}
      {suggestion && suggestion !== value ? (
        <button
          type="button"
          onClick={() => onChange(suggestion)}
          className="mt-2 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-signal-wash px-3.5 text-sm text-signal-deep transition-colors hover:bg-glow"
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
