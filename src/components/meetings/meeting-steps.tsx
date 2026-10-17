"use client";

import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TrackedLink } from "@/components/card/profile-actions";
import { Button } from "@/components/ui/button";
import { Field, inputClasses } from "@/components/ui/field";
import type { FieldErrors } from "@/lib/card/clean-text";
import { cn } from "@/lib/cn";
import { FORMAT_LABELS, MEETING_DURATIONS, MEETING_LIMITS, type MeetingDuration, type MeetingFormat } from "@/lib/meetings/constants";
import type { MeetingFormWhen, MeetingFormWho } from "@/lib/meetings/form-storage";
import { formatDuration, type MeetingRules } from "@/lib/meetings/rules";
import { formatSlotShort, timeZoneLabel } from "@/lib/meetings/time";
import { Segmented } from "./form-bits";
import { CONSENT_ERROR_ID, FORMAT_ICONS } from "./shared";
import { SlotPicker } from "./slot-picker";

/**
 * The two steps of "Agendar reunión" (when, then who). Their own module so the
 * card page loads them when the visitor opens the panel, not with the page:
 * the picker and the time formatting are most of the meeting form's weight.
 */

/** What the visitor chose in step 1. */
export type When = MeetingFormWhen;

/** What they typed in step 2. */
export type Who = MeetingFormWho & { consent: boolean };

interface StepWhenProps {
  owner: string;
  slug: string;
  booking: { href: string; linkId: string } | null;
  when: When;
  onChange: (patch: Partial<When>) => void;
  timeZone: string;
  /** The visitor's own zone, when it isn't the one the picker works in. */
  viewerTimeZone: string;
  /** True when the picker works in the owner's zone. */
  ownersZone: boolean;
  rules: MeetingRules | null;
  now: number;
  errors: FieldErrors;
  onNext: () => void;
}

export function StepWhen({ owner, slug, booking, when, onChange, timeZone, viewerTimeZone, ownersZone, rules, now, errors, onNext }: StepWhenProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(false), 1400);
    return () => window.clearTimeout(timer);
  }, [flash]);
  const count = when.slots.length;

  function next() {
    if (count > 0) return onNext();
    onNext();
    // Nothing picked yet: bring the days back into view and flash them.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    picker.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setFlash(true);
  }

  return (
    <div className="animate-rise space-y-5">
      <div>
        <h3 ref={heading} tabIndex={-1} className="font-display text-[1.7rem] leading-tight outline-none">
          ¿Cuándo os <em className="text-signal">veis?</em>
        </h3>
        <p className="mt-1 text-sm text-muted">
          Propón hasta tres horas ({timeZoneLabel(timeZone)}{ownersZone ? `, la de ${owner}` : ""}). {owner} recibe un email y elige una.
        </p>
        {booking ? (
          <p className="mt-2 text-sm text-ink-soft">
            ¿Prefieres ver sus huecos libres?{" "}
            <TrackedLink href={booking.href} slug={slug} linkId={booking.linkId} className="inline-flex items-center gap-0.5 font-medium text-signal-deep underline-offset-4 hover:underline">
              Abrir su calendario
              <ArrowUpRight className="size-3.5" aria-hidden />
            </TrackedLink>
          </p>
        ) : null}
      </div>
      <div
        ref={picker}
        className={cn(
          "scroll-mt-4 rounded-2xl ring-offset-4 ring-offset-card transition-shadow duration-300",
          flash && "ring-2 ring-signal",
        )}
      >
        <SlotPicker
          timeZone={timeZone}
          viewerTimeZone={viewerTimeZone}
          rules={rules}
          value={when.slots}
          onChange={(slots) => onChange({ slots })}
          now={now}
          chooser={owner}
          error={errors.slots}
        />
      </div>
      <Segmented<MeetingDuration>
        label="Duración"
        value={when.duration}
        options={MEETING_DURATIONS.map((d) => ({ value: d, label: formatDuration(d) }))}
        onChange={(duration) => onChange({ duration })}
      />
      <Segmented<MeetingFormat>
        label="Cómo"
        value={when.format}
        options={(Object.keys(FORMAT_LABELS) as MeetingFormat[]).filter((f) => !rules || rules.formats.includes(f)).map((f) => {
          const Icon = FORMAT_ICONS[f];
          return { value: f, label: FORMAT_LABELS[f], icon: <Icon className="size-4 shrink-0" aria-hidden /> };
        })}
        onChange={(format) => onChange({ format })}
        stacked
      />
      {when.format === "in_person" ? (
        <Field label="Dónde" optional error={errors.location} hint="Un sitio, o un enlace de Google Maps o Apple Maps. Se puede cambiar al confirmar.">
          {(props) => (
            <input
              {...props}
              value={when.location}
              onChange={(e) => onChange({ location: e.target.value })}
              maxLength={MEETING_LIMITS.videoLink}
              placeholder="Café Central, Madrid"
              className={inputClasses()}
            />
          )}
        </Field>
      ) : when.format === "video" ? (
        <Field label="Enlace (si ya lo tienes)" optional error={errors.location} hint={`De Meet, Zoom, Teams, Whereby, Jitsi o Webex. Si no, ${owner} lo añade al confirmar.`}>
          {(props) => (
            <input
              {...props}
              type="url"
              inputMode="url"
              value={when.link}
              onChange={(e) => onChange({ link: e.target.value })}
              maxLength={MEETING_LIMITS.videoLink}
              placeholder="https://meet.google.com/…"
              className={inputClasses()}
            />
          )}
        </Field>
      ) : (
        <p className="text-xs text-muted">{`${owner} te llamará: en el siguiente paso deja tu teléfono.`}</p>
      )}
      <Button size="lg" variant={count > 0 ? "signal" : "ink"} className={cn("group w-full", count === 0 && "opacity-60")} onClick={next}>
        {count === 0 ? "Elige al menos una hora" : `Continuar con ${count} ${count === 1 ? "hora" : "horas"}`}
        {count > 0 ? <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden /> : null}
      </Button>
    </div>
  );
}

interface StepWhoProps {
  owner: string;
  ownerFullName: string;
  when: When;
  who: Who;
  onChange: (patch: Partial<Who>) => void;
  timeZone: string;
  errors: FieldErrors;
  onBack: () => void;
}

export function StepWho({ owner, ownerFullName, when, who, onChange, timeZone, errors, onBack }: StepWhoProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const FormatIcon = FORMAT_ICONS[when.format];
  const text = (key: "name" | "email" | "phone" | "company" | "topic") => ({
    name: key,
    value: who[key],
    onChange: (e: { target: { value: string } }) => onChange({ [key]: e.target.value }),
  });
  return (
    <div className="animate-rise space-y-4">
      <div>
        <h3 ref={heading} tabIndex={-1} className="font-display text-[1.7rem] leading-tight outline-none">
          ¿Cómo te <em className="text-signal">avisamos?</em>
        </h3>
        <p className="mt-1 text-sm text-muted">Te escribimos aquí cuando {owner} elija una hora.</p>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-2xl bg-paper-deep/70 px-3.5 py-3">
        <div className="min-w-0 text-sm">
          <p className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-mark text-ink tabular-nums">
            {when.slots.map((iso) => (
              <span key={iso}>{formatSlotShort(iso, timeZone)}</span>
            ))}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-muted">
            <FormatIcon className="size-3.5 shrink-0" aria-hidden />
            {formatDuration(when.duration)} · {FORMAT_LABELS[when.format]}
            {when.format === "in_person" && when.location.trim() ? ` · ${when.location.trim()}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-signal-deep hover:bg-signal-wash/60"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Cambiar horas
        </button>
      </div>

      <Field label="Nombre" error={errors.name}>
        {(props) => <input {...props} {...text("name")} required maxLength={MEETING_LIMITS.name} autoComplete="name" className={inputClasses()} />}
      </Field>
      <Field label="Email" error={errors.email} hint="Aquí te llegará la invitación cuando confirme.">
        {(props) => (
          <input {...props} {...text("email")} type="email" inputMode="email" required maxLength={MEETING_LIMITS.email} autoComplete="email" className={inputClasses()} />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Teléfono" optional={when.format !== "phone"} error={errors.phone}>
          {(props) => (
            <input
              {...props}
              {...text("phone")}
              type="tel"
              inputMode="tel"
              required={when.format === "phone"}
              maxLength={MEETING_LIMITS.phone}
              autoComplete="tel"
              className={inputClasses()}
            />
          )}
        </Field>
        <Field label="Empresa" optional error={errors.company}>
          {(props) => <input {...props} {...text("company")} maxLength={MEETING_LIMITS.company} autoComplete="organization" className={inputClasses()} />}
        </Field>
      </div>
      <Field label="¿De qué queréis hablar?" optional error={errors.topic}>
        {(props) => (
          <textarea
            {...props}
            {...text("topic")}
            rows={2}
            maxLength={MEETING_LIMITS.topic}
            placeholder="Nos conocimos en… · Me gustaría hablar de…"
            className={inputClasses({ size: "multiline" })}
          />
        )}
      </Field>

      {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
      <div aria-hidden="true" className="absolute top-0 left-0 h-px w-px overflow-hidden opacity-0">
        <label>
          Web
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm leading-snug text-ink-soft">
        <input
          type="checkbox"
          name="consent"
          required
          checked={who.consent}
          onChange={(e) => onChange({ consent: e.target.checked })}
          aria-invalid={Boolean(errors.consent)}
          aria-describedby={errors.consent ? CONSENT_ERROR_ID : undefined}
          className="size-5 shrink-0 accent-[var(--color-ink)]"
        />
        <span>
          Acepto que {ownerFullName} reciba estos datos y que PassMe me escriba sobre esta reunión.{" "}
          <a href="/privacidad#reuniones" className="underline underline-offset-2 hover:text-ink">
            Más info
          </a>
        </span>
      </label>
    </div>
  );
}
