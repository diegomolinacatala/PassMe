"use client";

import { ArrowLeft, ArrowRight, CalendarClock, CircleCheck } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { submitMeetingAction, type MeetingRequestState } from "@/app/u/[slug]/meeting-actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, InlineError, inputClasses } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { Turnstile } from "@/components/ui/turnstile";
import { rememberDetails } from "@/lib/card/draft-storage";
import { createPath, parseVia } from "@/lib/card/quick";
import type { FieldErrors } from "@/lib/card/schema";
import { cn } from "@/lib/cn";
import { firstName, formatDuration } from "@/lib/meetings/model";
import { DEFAULT_DURATION, FORMAT_LABELS, MEETING_DURATIONS, MEETING_LIMITS, type MeetingDuration, type MeetingFormat } from "@/lib/meetings/schema";
import { formatSlotShort, localTimeZone, timeZoneCity } from "@/lib/meetings/time";
import { Segmented } from "./form-bits";
import { FORMAT_ICONS } from "./shared";
import { SlotPicker } from "./slot-picker";

interface MeetingRequestProps {
  slug: string;
  ownerName: string;
  source: string;
  captchaSiteKey: string | null;
}

/** What the visitor chose in step 1. */
interface When {
  slots: string[];
  duration: MeetingDuration;
  format: MeetingFormat;
  location: string;
}

/** What they typed in step 2. */
interface Who {
  name: string;
  email: string;
  phone: string;
  company: string;
  topic: string;
  consent: boolean;
}

const STEP_ONE_FIELDS = new Set(["slots", "duration", "format", "location"]);

function SentMessage({ owner, slug, source, state, slots, timeZone }: {
  owner: string;
  slug: string;
  source: string;
  state: Extract<MeetingRequestState, { status: "sent" }>;
  slots: ReadonlyArray<string>;
  timeZone: string;
}) {
  const heading = useRef<HTMLParagraphElement>(null);
  const { details } = state;
  const via = parseVia(source);
  useEffect(() => heading.current?.focus(), []);
  // Any "create mine" button on the page (top bar, dark block) now starts with these details.
  useEffect(() => {
    rememberDetails({ fullName: details.name, email: details.email, phone: details.phone, company: details.company }, slug, via);
  }, [details, slug, via]);
  return (
    <div role="status" className="animate-rise rounded-panel border hairline bg-card px-5 py-6 text-center">
      <CircleCheck className="mx-auto size-7 text-ok" aria-hidden />
      <p ref={heading} tabIndex={-1} className="mt-2 font-display text-2xl leading-tight outline-none">
        Propuesta enviada a <em className="text-signal">{owner}.</em>
      </p>
      <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
        {slots.map((iso) => (
          <li key={iso} className="rounded-full bg-paper-deep px-3 py-1 font-mono text-mark text-ink-soft tabular-nums">
            {formatSlotShort(iso, timeZone)}
          </li>
        ))}
      </ul>
      <p className="mx-auto mt-3 max-w-xs text-sm text-muted">
        {state.demo
          ? "Es la tarjeta de ejemplo: esta vez no se ha enviado nada."
          : `Ya la tiene ${owner}. En cuanto elija una hora, te escribimos a ${state.email} con la invitación para tu calendario.`}
      </p>
      <div className="mt-5 border-t hairline pt-5">
        <p className="text-sm text-ink-soft">¿Y si te haces tu propia tarjeta? Ya tenemos tus datos.</p>
        <Link
          href={createPath(slug, via)}
          className={buttonClasses({ variant: "signal", className: "group mt-3" })}
        >
          Crear la mía con estos datos
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function CollapsedCta({ owner, onOpen }: { owner: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-4 rounded-panel border border-ink/80 bg-card px-5 py-4 text-left shadow-soft transition-[background-color,transform] duration-300 hover:bg-white active:translate-y-px"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-paper transition-transform duration-500 group-hover:-rotate-6">
        <CalendarClock className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Agendar reunión con {owner}</span>
        <span className="block text-sm text-muted">Propón día y hora. {owner} confirma con un toque.</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
    </button>
  );
}

interface StepWhenProps {
  owner: string;
  when: When;
  onChange: (patch: Partial<When>) => void;
  timeZone: string;
  now: number;
  errors: FieldErrors;
  onNext: () => void;
}

function StepWhen({ owner, when, onChange, timeZone, now, errors, onNext }: StepWhenProps) {
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
          Propón hasta tres horas (hora de {timeZoneCity(timeZone)}). {owner} recibe un email y elige una.
        </p>
      </div>
      <div
        ref={picker}
        className={cn(
          "scroll-mt-4 rounded-2xl ring-offset-4 ring-offset-card transition-shadow duration-300",
          flash && "ring-2 ring-signal",
        )}
      >
        <SlotPicker timeZone={timeZone} value={when.slots} onChange={(slots) => onChange({ slots })} now={now} chooser={owner} error={errors.slots} />
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
        options={(Object.keys(FORMAT_LABELS) as MeetingFormat[]).map((f) => {
          const Icon = FORMAT_ICONS[f];
          return { value: f, label: FORMAT_LABELS[f], icon: <Icon className="size-4 shrink-0" aria-hidden /> };
        })}
        onChange={(format) => onChange({ format })}
        stacked
      />
      {when.format === "in_person" ? (
        <Field label="Dónde" optional error={errors.location} hint="Un sitio que os venga bien a los dos. Se puede cambiar al confirmar.">
          {(props) => (
            <input
              {...props}
              value={when.location}
              onChange={(e) => onChange({ location: e.target.value })}
              maxLength={MEETING_LIMITS.location}
              placeholder="Café Central, Madrid"
              className={inputClasses()}
            />
          )}
        </Field>
      ) : (
        <p className="text-xs text-muted">
          {when.format === "video"
            ? `${owner} añade el enlace de la videollamada al confirmar (o os lo pasáis por email).`
            : `${owner} te llamará: en el siguiente paso deja tu teléfono.`}
        </p>
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

function StepWho({ owner, ownerFullName, when, who, onChange, timeZone, errors, onBack }: StepWhoProps) {
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
          ¿Quién <em className="text-signal">propone?</em>
        </h3>
        <p className="mt-1 text-sm text-muted">Para que {owner} sepa quién eres y podamos enviarte la invitación.</p>
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
          <input {...props} {...text("topic")} maxLength={MEETING_LIMITS.topic} placeholder="Nos conocimos en… / Me gustaría hablar de…" className={inputClasses()} />
        )}
      </Field>

      {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
      <div aria-hidden="true" className="absolute top-0 left-0 h-px w-px overflow-hidden opacity-0">
        <label>
          Web
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex items-start gap-3 text-sm leading-snug text-ink-soft">
        <input
          type="checkbox"
          name="consent"
          required
          checked={who.consent}
          onChange={(e) => onChange({ consent: e.target.checked })}
          aria-invalid={Boolean(errors.consent)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]"
        />
        <span>
          Acepto que {ownerFullName} reciba estos datos y que PassMe me escriba sobre esta reunión.{" "}
          <a href="/privacidad#reuniones" className="underline underline-offset-2 hover:text-ink">
            Más info
          </a>
        </span>
      </label>
      {errors.consent ? <InlineError className="-mt-2">{errors.consent}</InlineError> : null}
    </div>
  );
}

/**
 * "Agendar reunión": the visitor proposes up to three times; the owner gets
 * them by email and confirms one with a tap. Two short steps (when → who),
 * collapsed by default so the card stays the star of the page.
 */
export function MeetingRequest({ slug, ownerName, source, captchaSiteKey }: MeetingRequestProps) {
  const [open, setOpen] = useState<{ now: number; timeZone: string } | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [when, setWhen] = useState<When>({ slots: [], duration: DEFAULT_DURATION, format: "in_person", location: "" });
  const [who, setWho] = useState<Who>({ name: "", email: "", phone: "", company: "", topic: "", consent: false });
  const [stepError, setStepError] = useState<string | null>(null);
  // Server errors go stale as soon as their field changes.
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  const [state, submit, pending] = useActionState<MeetingRequestState, FormData>(submitMeetingAction.bind(null, slug, source), { status: "idle" });
  const owner = firstName(ownerName);
  const form = useRef<HTMLFormElement>(null);

  // A rejected submission: take the keyboard (and screen reader) to the first field to fix.
  useEffect(() => {
    if (state.status !== "error") return;
    const target = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form.current?.querySelector<HTMLElement>("[data-form-error]");
    target?.focus();
  }, [state]);

  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    setEdited(new Set());
    // A failed submission about the "when" goes back to that step.
    if (state.status === "error" && Object.keys(state.errors ?? {}).some((k) => STEP_ONE_FIELDS.has(k))) setStep(1);
  }

  if (state.status === "sent" && open) {
    return <SentMessage owner={owner} slug={slug} source={source} state={state} slots={when.slots} timeZone={open.timeZone} />;
  }
  if (!open) return <CollapsedCta owner={owner} onOpen={() => setOpen({ now: Date.now(), timeZone: localTimeZone() })} />;

  const serverErrors = state.status === "error" ? (state.errors ?? {}) : {};
  const errors: FieldErrors = Object.fromEntries(Object.entries(serverErrors).filter(([key]) => !edited.has(key)));
  if (stepError) errors.slots = stepError;
  const touch = (keys: string[]) => setEdited((prev) => new Set([...prev, ...keys]));

  // Submitting by hand (not via the form action) skips React's automatic form reset,
  // so after a server error every field and the checkbox look exactly as they were.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => submit(formData));
  }

  return (
    <section aria-labelledby="agendar-reunion">
      <form ref={form} action={submit} onSubmit={onSubmit} className="relative animate-rise rounded-panel border hairline bg-card px-5 py-5" noValidate>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="agendar-reunion" className="eyebrow">
            Agendar reunión con {owner}
          </h2>
          <p className="eyebrow" aria-hidden>
            {step}/2
          </p>
        </div>

        {/* Step 1's choices travel with the form whichever step is on screen. */}
        {when.slots.map((iso) => (
          <input key={iso} type="hidden" name="slot" value={iso} />
        ))}
        <input type="hidden" name="duration" value={when.duration} />
        <input type="hidden" name="format" value={when.format} />
        <input type="hidden" name="location" value={when.format === "in_person" ? when.location : ""} />
        <input type="hidden" name="timeZone" value={open.timeZone} />

        {step === 1 ? (
          <StepWhen
            owner={owner}
            when={when}
            onChange={(patch) => {
              setWhen((prev) => ({ ...prev, ...patch }));
              touch(Object.keys(patch));
              if (patch.slots?.length) setStepError(null);
            }}
            timeZone={open.timeZone}
            now={open.now}
            errors={errors}
            onNext={() => {
              if (when.slots.length === 0) return setStepError("Elige al menos una hora.");
              setStepError(null);
              setStep(2);
            }}
          />
        ) : (
          <>
            <StepWho
              owner={owner}
              ownerFullName={ownerName}
              when={when}
              who={who}
              onChange={(patch) => {
                setWho((prev) => ({ ...prev, ...patch }));
                touch(Object.keys(patch));
              }}
              timeZone={open.timeZone}
              errors={errors}
              onBack={() => setStep(1)}
            />
            <div className="mt-4 space-y-4">
              {captchaSiteKey ? <Turnstile siteKey={captchaSiteKey} action="meeting" resetKey={state} /> : null}
              {state.status === "error" ? (
                <div data-form-error tabIndex={-1} className="outline-none">
                  <Notice tone="error">{state.message}</Notice>
                </div>
              ) : null}
              <SubmitButton pending={pending} pendingLabel="Enviando…" icon={<CalendarClock className="size-5" aria-hidden />}>
                Enviar propuesta
              </SubmitButton>
              <p className="text-center text-xs text-muted">Tus datos solo los ve {owner}. No te apuntamos a nada.</p>
            </div>
          </>
        )}
      </form>
    </section>
  );
}
