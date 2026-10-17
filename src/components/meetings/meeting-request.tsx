"use client";

import { ArrowRight, CalendarClock, CircleCheck } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { submitMeetingAction, type MeetingRequestState } from "@/app/u/[slug]/meeting-actions";
import { buttonClasses } from "@/components/ui/button";
import { InlineError } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { Turnstile } from "@/components/ui/turnstile";
import { ActionPanel, PanelCloseButton, useCardPage } from "@/components/card/card-page-context";
import { lazyPanel, preloadWhenIdle } from "@/components/card/lazy-panel";
import { readStoredDraft, rememberDetails } from "@/lib/card/draft-storage";
import type { FieldErrors } from "@/lib/card/clean-text";
import { firstName } from "@/lib/card/first-name";
import { createPath, parseVia } from "@/lib/card/paths";
import { DEFAULT_DURATION } from "@/lib/meetings/constants";
import { clearMeetingForm, readMeetingForm, writeMeetingForm } from "@/lib/meetings/form-storage";
import { slotAllowed, type MeetingRules } from "@/lib/meetings/rules";
import { formatDay, formatSlotShort, formatTime, localTimeZone } from "@/lib/meetings/time";
import type { When, Who } from "./meeting-steps";
import { CONSENT_ERROR_ID, useClientNow } from "./shared";

// The two steps (picker, fields) are a separate download: it starts when the visitor's finger or pointer
// gets near the row (or a few seconds after the page settles), and most scanners never open the panel.
const loadSteps = () => import("./meeting-steps");
const { Panel: StepWhen, preload: preloadSteps } = lazyPanel(() => loadSteps().then((module) => module.StepWhen));
const { Panel: StepWho } = lazyPanel(() => loadSteps().then((module) => module.StepWho));

interface MeetingRequestProps {
  slug: string;
  ownerName: string;
  source: string;
  captchaSiteKey: string | null;
  /** The card's booking link (Calendly…), offered here instead of in the card's list. */
  booking: { href: string; linkId: string } | null;
  /** The owner's zone (P8.1): the picker works in it. Undefined before the migration: the visitor's own. */
  ownerTimeZone?: string;
  /** What the owner takes (P8.4); null = no limits. The server checks it again. */
  rules: MeetingRules | null;
}

/** When the request never reached the server (a dropped connection, a deploy in between). */
const CONNECTION_ERROR = "No hemos podido conectar. Inténtalo de nuevo.";

const STEP_ONE_FIELDS = new Set(["slots", "duration", "format", "location"]);
/** Step 2 has its own history entry: the browser's back button returns to the times. */
const STEP_TWO_HASH = "#reunion-2";
const EMPTY_WHEN: When = { slots: [], duration: DEFAULT_DURATION, format: "in_person", location: "", link: "" };
const EMPTY_WHO: Who = { name: "", email: "", phone: "", company: "", topic: "", consent: false };

/** Step 1 as the owner's settings allow it: their usual length, an accepted format, and no times they don't take. */
function allowedWhen(when: When, rules: MeetingRules | null, timeZone: string, now: number, fresh = false): When {
  if (!rules) return when;
  return {
    ...when,
    duration: fresh ? rules.duration : when.duration,
    format: rules.formats.includes(when.format) ? when.format : rules.formats[0]!,
    slots: when.slots.filter((slot) => slotAllowed(slot, rules, timeZone, new Date(now))),
  };
}

function SentMessage({ owner, slug, source, state, slots, timeZone, saved }: {
  owner: string;
  slug: string;
  source: string;
  state: Extract<MeetingRequestState, { status: "sent" }>;
  slots: ReadonlyArray<string>;
  timeZone: string;
  /** "Guardar contacto" is done: creating a card becomes the page's main action. */
  saved: boolean;
}) {
  const heading = useRef<HTMLParagraphElement>(null);
  const { details } = state;
  const via = parseVia(source);
  const last = slots.at(-1);
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
          : state.emailSkipped
            ? `Tu propuesta está guardada y ${owner} la verá en su editor, pero no hemos podido avisarle por email. Si tienes prisa, escríbele tú o déjale tu contacto.`
            : `Ya la tiene ${owner}. En cuanto elija una hora, te escribimos a ${state.email} con la invitación para tu calendario.`}
      </p>
      {last ? (
        <p className="mx-auto mt-2 max-w-xs text-xs text-muted">
          Si {owner} no responde antes del {formatDay(last, timeZone)} a las {formatTime(last, timeZone)}, la propuesta caduca sola.
        </p>
      ) : null}
      {state.guestPath ? (
        <Link href={state.guestPath} className={buttonClasses({ variant: "outline", className: "mt-4" })}>
          Ver o cancelar mi propuesta
        </Link>
      ) : null}
      <div className="mt-5 border-t hairline pt-5">
        <p className="text-sm text-ink-soft">
          ¿Te haces tu propia tarjeta? <strong className="font-medium text-ink">Empieza con lo que acabas de escribir.</strong>
        </p>
        <Link
          href={createPath(slug, via)}
          className={buttonClasses({ variant: saved ? "signal" : "ink", className: "group mt-3" })}
        >
          Crear la mía con estos datos
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/**
 * "Agendar reunión": the visitor proposes up to three times; the owner gets
 * them by email and confirms one with a tap. Two short steps (when → who),
 * collapsed by default so the card stays the star of the page.
 */
export function MeetingRequest({ slug, ownerName, source, captchaSiteKey, booking, ownerTimeZone, rules }: MeetingRequestProps) {
  const { saved, markSent, open: showPanel } = useCardPage();
  // Taken when the panel first opens: "now" and the visitor's time zone for the slot picker.
  const [open, setOpen] = useState<{ now: number; timeZone: string } | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [when, setWhen] = useState<When>(() => (rules ? { ...EMPTY_WHEN, duration: rules.duration, format: rules.formats.includes(EMPTY_WHEN.format) ? EMPTY_WHEN.format : rules.formats[0]! } : EMPTY_WHEN));
  const [who, setWho] = useState<Who>(EMPTY_WHO);
  // Back in this tab (reload, back button) or sent here to try again (?reunion=1): pick up where it was.
  const clientNow = useClientNow();
  const [restored, setRestored] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  if (clientNow > 0 && !restored) {
    setRestored(true);
    const stored = readMeetingForm(slug);
    const retry = new URLSearchParams(window.location.search).get("reunion") === "1";
    if (stored || retry) {
      const known = readStoredDraft()?.draft;
      setWhen(allowedWhen(stored?.when ?? EMPTY_WHEN, rules, ownerTimeZone ?? localTimeZone(), clientNow, !stored));
      setWho({
        ...EMPTY_WHO,
        name: known?.fullName ?? "",
        email: known?.email ?? "",
        phone: known?.phone ?? "",
        company: known?.company ?? "",
        ...Object.fromEntries(Object.entries(stored?.who ?? {}).filter(([, value]) => value)),
      });
      setStep(stored?.step === 2 && window.location.hash === STEP_TWO_HASH ? 2 : 1);
      setOpen({ now: clientNow, timeZone: localTimeZone() });
      setAutoOpen(true);
    }
  }
  useEffect(() => {
    if (autoOpen) showPanel("meeting", { scroll: true });
  }, [autoOpen, showPanel]);
  const [stepError, setStepError] = useState<string | null>(null);
  // Server errors go stale as soon as their field changes.
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  const [state, submit, pending] = useActionState<MeetingRequestState, FormData>(
    async (previous, formData) => {
      try {
        return await submitMeetingAction(slug, source, previous, formData);
      } catch {
        // The request itself failed (offline, or the page is older than the server). What the visitor chose
        // and typed lives in this component's state, so the form stays exactly as it was.
        return { status: "error", message: CONNECTION_ERROR };
      }
    },
    { status: "idle" },
  );
  const owner = firstName(ownerName);

  useEffect(() => preloadWhenIdle(preloadSteps), []);
  const form = useRef<HTMLFormElement>(null);

  // A rejected submission: take the keyboard (and screen reader) to the first field to fix.
  useEffect(() => {
    if (state.status !== "error") return;
    const target = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form.current?.querySelector<HTMLElement>("[data-form-error]");
    target?.focus();
  }, [state]);

  useEffect(() => {
    if (state.status !== "sent") return;
    markSent("meeting");
    clearMeetingForm(slug);
    if (window.location.hash === STEP_TWO_HASH) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [state.status, markSent, slug]);

  // Keep the half-filled form for this tab (never the consent box).
  useEffect(() => {
    if (!open || state.status === "sent") return;
    const typed = { name: who.name, email: who.email, phone: who.phone, company: who.company, topic: who.topic };
    writeMeetingForm(slug, { step, when, who: typed });
  }, [open, step, when, who, slug, state.status]);

  // The browser's back (and forward) button moves between the two steps.
  useEffect(() => {
    const onPopState = () => setStep(window.location.hash === STEP_TWO_HASH && when.slots.length > 0 ? 2 : 1);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [when.slots.length]);

  function toStepTwo() {
    setStep(2);
    if (window.location.hash !== STEP_TWO_HASH) window.history.pushState(null, "", STEP_TWO_HASH);
  }

  function toStepOne() {
    // Undo our own history entry, so "back" afterwards leaves the page as expected.
    if (window.location.hash === STEP_TWO_HASH) window.history.back();
    setStep(1);
  }

  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    setEdited(new Set());
    // A failed submission about the "when" goes back to that step.
    if (state.status === "error" && Object.keys(state.errors ?? {}).some((k) => STEP_ONE_FIELDS.has(k))) setStep(1);
  }

  if (state.status === "sent" && open) {
    return <SentMessage owner={owner} slug={slug} source={source} state={state} slots={when.slots} timeZone={open.timeZone} saved={saved} />;
  }

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
    <ActionPanel
      panel="meeting"
      id="agendar"
      icon={<CalendarClock className="size-5" aria-hidden />}
      title={`Agendar reunión con ${owner}`}
      subtitle={`Propón día y hora. ${owner} confirma con un toque.`}
      onOpen={() => setOpen((current) => current ?? { now: Date.now(), timeZone: localTimeZone() })}
      onWarm={preloadSteps}
    >
      {open ? (
        <section aria-labelledby="agendar-reunion">
          <form ref={form} action={submit} onSubmit={onSubmit} className="relative animate-rise rounded-panel border hairline bg-card px-5 py-5" noValidate>
            <div className="-mt-2 -mr-2 mb-2 flex items-center justify-between gap-3">
              <h2 id="agendar-reunion" className="eyebrow">
                Agendar reunión con {owner}
              </h2>
              <div className="flex shrink-0 items-center gap-1">
                <p className="eyebrow" aria-hidden>
                  {step}/2
                </p>
                <PanelCloseButton panel="meeting" />
              </div>
            </div>

            {/* Step 1's choices travel with the form whichever step is on screen. */}
            {when.slots.map((iso) => (
              <input key={iso} type="hidden" name="slot" value={iso} />
            ))}
            <input type="hidden" name="duration" value={when.duration} />
            <input type="hidden" name="format" value={when.format} />
            <input type="hidden" name="location" value={when.format === "in_person" ? when.location : when.format === "video" ? when.link : ""} />
            <input type="hidden" name="timeZone" value={open.timeZone} />

            {step === 1 ? (
              <StepWhen
                owner={owner}
                slug={slug}
                booking={booking}
                when={when}
                onChange={(patch) => {
                  setWhen((prev) => ({ ...prev, ...patch }));
                  touch(Object.keys(patch));
                  if (patch.slots?.length) setStepError(null);
                }}
                timeZone={ownerTimeZone ?? open.timeZone}
                viewerTimeZone={open.timeZone}
                ownersZone={Boolean(ownerTimeZone)}
                rules={rules}
                now={open.now}
                errors={errors}
                onNext={() => {
                  if (when.slots.length === 0) return setStepError("Elige al menos una hora.");
                  setStepError(null);
                  toStepTwo();
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
                  timeZone={ownerTimeZone ?? open.timeZone}
                  errors={errors}
                  onBack={toStepOne}
                />
                <div className="mt-4 space-y-4">
                  {captchaSiteKey ? <Turnstile siteKey={captchaSiteKey} action="meeting" resetKey={state} /> : null}
                  {state.status === "error" ? (
                    <div data-form-error tabIndex={-1} className="outline-none">
                      <Notice tone="error">{state.message}</Notice>
                    </div>
              ) : null}
              <div className="space-y-2">
                {/* Next to the button, where the eye is when sending fails. */}
                {errors.consent ? <InlineError id={CONSENT_ERROR_ID}>{errors.consent}</InlineError> : null}
                <SubmitButton pending={pending} pendingLabel="Enviando…" icon={<CalendarClock className="size-5" aria-hidden />}>
                  Enviar propuesta
                </SubmitButton>
              </div>
              <p className="text-center text-xs text-muted">Tus datos solo los ve {owner}. No te apuntamos a nada.</p>
            </div>
          </>
        )}
      </form>
    </section>
      ) : null}
    </ActionPanel>
  );
}
