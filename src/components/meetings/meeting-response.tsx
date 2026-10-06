"use client";

import { ArrowLeft, ArrowUpRight, CalendarCheck2, CalendarClock, CalendarX2, Check, Clock, Download, Mail, Phone, Undo2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { respondMeetingAction, type MeetingResponseState } from "@/app/reunion/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { CHOICE_FOCUS } from "@/components/ui/choice";
import { Field, inputClasses } from "@/components/ui/field";
import { NewTabHint } from "@/components/ui/new-tab-hint";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { contactEmailHref, contactPhoneHref } from "@/lib/card/contact";
import { rememberDetails } from "@/lib/card/draft-storage";
import type { FieldErrors } from "@/lib/card/schema";
import { cn } from "@/lib/cn";
import { linkHref } from "@/lib/card/links";
import { describeWhere, displayName, firstName, formatDuration, hasMapLink } from "@/lib/meetings/model";
import { MEETING_LIMITS } from "@/lib/meetings/schema";
import type { MeetingAction } from "@/lib/meetings/state";
import { addMinutes, formatDay, formatTime, otherZoneTime, timeZoneLabel } from "@/lib/meetings/time";
import { viewGoogleCalendarUrl, type MeetingView } from "@/lib/meetings/view";
import { FORMAT_ICONS, useClientNow } from "./shared";
import { SlotPicker } from "./slot-picker";

export interface MeetingPreset {
  /** ?hora=N from the email's button: that time comes preselected. */
  slotIndex: number | null;
  /** ?accion=otra / ?accion=no from the email's links. */
  mode: "counter" | "decline" | null;
}

interface MeetingResponseProps {
  id: string;
  signature: string;
  initial: MeetingView;
  preset: MeetingPreset;
  demo: boolean;
}

type Mode = "confirm" | "counter" | "decline" | "cancel";
type Act = (formData: FormData) => void;

const DONE_MESSAGES: Record<MeetingAction, (other: string) => string> = {
  confirm: () => "Confirmada. Os acabamos de enviar la invitación a los dos.",
  counter: (other) => `Enviado. Te avisaremos por email cuando ${other} elija una hora.`,
  decline: (other) => `Respuesta enviada. Le hemos avisado a ${other}.`,
  cancel: (other) => `Cancelada. Le hemos avisado a ${other}.`,
};

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-panel border hairline bg-card px-5 py-5", className)}>{children}</section>;
}

function otherName(view: MeetingView): string {
  return firstName(view.party === "owner" ? view.guest.name : view.owner.name);
}

function Title({ view }: { view: MeetingView }) {
  const other = otherName(view);
  const canAnswer = view.actions.includes("confirm");
  switch (view.stage) {
    case "awaiting":
      if (!canAnswer) return <>Esperando a <em className="text-signal">{other}</em></>;
      return view.proposedBy === "guest" ? (
        <>
          {other} quiere <em className="text-signal">reunirse contigo</em>
        </>
      ) : (
        <>
          {other} te propone <em className="text-signal">otra hora</em>
        </>
      );
    case "confirmed":
      return (
        <>
          Reunión <em className="text-signal">confirmada</em>
        </>
      );
    case "past":
      return <>Esta reunión ya pasó</>;
    case "declined":
      return view.closedBy === view.party ? <>Has dicho que no esta vez</> : <>{other} no puede esta vez</>;
    case "cancelled":
      if (view.closedBy !== view.party) return <>{other} ha cancelado</>;
      return view.confirmedStart ? <>Reunión cancelada</> : <>Propuesta cancelada</>;
    case "expired":
      return <>Las horas propuestas ya pasaron</>;
  }
}

function StatusBanner({ state, other }: { state: MeetingResponseState; other: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status !== "idle") ref.current?.focus();
  }, [state]);
  if (state.status === "idle") return null;
  const error = state.status === "error";
  return (
    <Notice ref={ref} focusable tone={error ? "error" : "ok"}>
      {error ? state.message : DONE_MESSAGES[state.action](other)}
      {state.status === "done" && state.demo ? " (Modo demo: no se ha enviado nada.)" : ""}
    </Notice>
  );
}

/** The other person: who they are and, for the owner, how to reach them. */
function Person({ view }: { view: MeetingView }) {
  const isOwner = view.party === "owner";
  const name = isOwner ? view.guest.name : view.owner.name;
  const email = isOwner ? view.guest.email : view.owner.email;
  const phone = isOwner ? view.guest.phone : null;
  return (
    <div className="flex items-start gap-3.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-signal-wash font-display text-xl text-signal-deep" aria-hidden>
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className="font-medium">{name}</p>
        {isOwner && view.guest.company ? <p className="text-sm text-muted">{view.guest.company}</p> : null}
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {email ? (
            <a href={contactEmailHref(email)} className="inline-flex min-w-0 items-center gap-1.5 text-signal-deep hover:underline">
              <Mail className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{email}</span>
            </a>
          ) : null}
          {phone ? (
            <a href={contactPhoneHref(phone)} className="inline-flex items-center gap-1.5 text-signal-deep hover:underline">
              <Phone className="size-3.5 shrink-0" aria-hidden />
              {phone}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <dt className="eyebrow w-20 shrink-0">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Who, when (once confirmed), how, how long, what about, and the latest note. */
function Summary({ view }: { view: MeetingView }) {
  const Icon = FORMAT_ICONS[view.format];
  const start = view.stage === "confirmed" || view.stage === "past" ? view.confirmedStart : null;
  const noteByMe = view.closedBy === view.party || (view.stage === "awaiting" && view.proposedBy === view.party);
  return (
    <Panel>
      <Person view={view} />
      <dl className="mt-4 divide-y divide-line/80 border-y border-line/80 text-sm">
        {start ? (
          <Fact label="Cuándo">
            <span className="first-letter:uppercase">
              {formatDay(start, view.timeZone)}, {formatTime(start, view.timeZone)}–{formatTime(addMinutes(start, view.durationMinutes), view.timeZone)}
            </span>
            <OtherZone iso={start} view={view} />
          </Fact>
        ) : null}
        <Fact label="Cómo">
          <span className="flex items-start gap-1.5">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0">
              {describeWhere(view)}
              {hasMapLink(view) ? (
                <>
                  {" · "}
                  <a href={linkHref("website", view.location)} target="_blank" rel="noopener noreferrer" className="font-medium text-signal-deep underline-offset-4 hover:underline">
                    Cómo llegar
                    <NewTabHint />
                  </a>
                </>
              ) : null}
            </span>
          </span>
        </Fact>
        <Fact label="Duración">{formatDuration(view.durationMinutes)}</Fact>
        {view.topic ? <Fact label="Tema">{view.topic}</Fact> : null}
      </dl>
      {view.responseNote ? (
        <blockquote className="mt-4 border-l-2 border-glow pl-3 text-sm text-ink-soft">
          <p className="eyebrow">{noteByMe ? "Tu nota" : otherName(view)}</p>
          <p className="mt-0.5 whitespace-pre-line">{view.responseNote}</p>
        </blockquote>
      ) : null}
    </Panel>
  );
}

function NoteField({
  label,
  placeholder,
  value,
  onChange,
  error,
  autoFocus,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoFocus?: boolean;
}) {
  return (
    <Field label={label} optional error={error}>
      {(props) => (
        <textarea
          {...props}
          name="note"
          rows={3}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={MEETING_LIMITS.note}
          placeholder={placeholder}
          className={inputClasses({ size: "multiline" })}
        />
      )}
    </Field>
  );
}

/** A panel's title takes focus when it opens, so the change is announced and the keyboard follows. */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-muted hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden />
      Volver
    </button>
  );
}

interface PanelProps {
  view: MeetingView;
  act: Act;
  pending: boolean;
  errors: FieldErrors;
}

/** One tap: the proposed times as large choices, plus the place or video link. */
function ConfirmPanel({
  view,
  act,
  pending,
  errors,
  selected,
  onSelect,
  onMode,
  returnFocus,
}: PanelProps & { selected: string | null; onSelect: (slot: string) => void; onMode: (mode: Mode) => void; returnFocus: Mode | null }) {
  const [location, setLocation] = useState(view.location || view.suggestedLocation);
  const counterButton = useRef<HTMLButtonElement>(null);
  const declineButton = useRef<HTMLButtonElement>(null);
  // Back from "Proponer otras horas" or "No puedo": focus returns to the button that opened it.
  useEffect(() => {
    if (returnFocus === "counter") counterButton.current?.focus();
    if (returnFocus === "decline") declineButton.current?.focus();
  }, [returnFocus]);
  return (
    <Panel className="animate-rise">
      <form action={act} className="space-y-4">
        <input type="hidden" name="intent" value="confirm" />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-soft">
            Elige una hora <span className="font-normal text-muted">({timeZoneLabel(view.timeZone)})</span>
          </legend>
          <div className="space-y-2">
            {view.openSlots.map((slot) => {
              const checked = slot === selected;
              return (
                <label
                  key={slot}
                  className={cn(
                    "flex min-h-16 cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-3 transition-[background-color,border-color,box-shadow] duration-200",
                    CHOICE_FOCUS,
                    checked ? "border-ink bg-paper shadow-soft" : "border-field-border bg-card hover:border-ink",
                  )}
                >
                  <input type="radio" name="slot" value={slot} checked={checked} onChange={() => onSelect(slot)} className="sr-only" />
                  <span
                    className={cn("grid size-6 shrink-0 place-items-center rounded-full border transition-colors", checked ? "border-signal-strong bg-signal-strong text-white" : "border-line-strong")}
                    aria-hidden
                  >
                    {checked ? <Check className="size-3.5" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium first-letter:uppercase">{formatDay(slot, view.timeZone)}</span>
                    <span className="block font-mono text-sm text-muted tabular-nums">
                      {formatTime(slot, view.timeZone)}–{formatTime(addMinutes(slot, view.durationMinutes), view.timeZone)}
                    </span>
                    <OtherZone iso={slot} view={view} />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {view.format === "phone" ? null : (
          <Field
            label={view.format === "video" ? "Enlace de la videollamada" : "Lugar"}
            optional
            error={errors.location}
            hint={view.format === "video" ? "De Meet, Zoom, Teams, Whereby, Jitsi o Webex. Si no, os lo pasáis por email." : "Puedes cambiarlo antes de confirmar."}
          >
            {(props) => (
              <input
                {...props}
                name="location"
                type={view.format === "video" ? "url" : "text"}
                inputMode={view.format === "video" ? "url" : undefined}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={MEETING_LIMITS.videoLink}
                placeholder={view.format === "video" ? "https://meet.google.com/…" : "Café Central, Madrid"}
                className={inputClasses()}
              />
            )}
          </Field>
        )}

        <SubmitButton pending={pending} pendingLabel="Confirmando…" icon={<CalendarCheck2 className="size-5" aria-hidden />}>
          {selected ? `Confirmar ${formatTime(selected, view.timeZone)}` : "Confirmar"}
        </SubmitButton>
        <InvitationNote view={view} />
      </form>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t hairline pt-4">
        {view.actions.includes("counter") ? (
          <Button ref={counterButton} variant="outline" onClick={() => onMode("counter")}>
            <CalendarClock className="size-4" aria-hidden />
            Proponer otras horas
          </Button>
        ) : null}
        <Button
          ref={declineButton}
          variant="ghost"
          onClick={() => onMode("decline")}
          className={view.actions.includes("counter") ? "" : "col-span-2"}
        >
          <CalendarX2 className="size-4" aria-hidden />
          No puedo
        </Button>
      </div>
    </Panel>
  );
}

/** "martes 6" for the question "¿Confirmas el martes 6 a las 12:30?". */
function shortDay(slot: string, timeZone: string): string {
  const match = /^(\S+), (\d+)/.exec(formatDay(slot, timeZone));
  return match ? `${match[1]} ${match[2]}` : formatDay(slot, timeZone);
}

/** Who will receive the invitation with which email (the owner's side only). */
function InvitationNote({ view }: { view: MeetingView }) {
  return (
    <p className="text-center text-xs text-muted">
      {view.party !== "owner" ? (
        "Os enviamos la invitación a los dos."
      ) : view.owner.email ? (
        <>
          {otherName(view)} recibirá la invitación con tu email <strong className="font-medium break-all text-ink-soft">{view.owner.email}</strong>.
        </>
      ) : (
        `${otherName(view)} recibirá la invitación con tu email para que podáis hablar.`
      )}
    </p>
  );
}

/**
 * Straight from the email's time button: the question, one wide button and
 * the ways out, above everything else. Still a second tap on purpose: mail
 * scanners open links, but never press buttons.
 */
function QuickConfirm({ view, act, pending, slot, onExpand, onMode }: PanelProps & { slot: string; onExpand: () => void; onMode: (mode: Mode) => void }) {
  const other = view.party === "owner" ? displayName(view.guest) : view.owner.name;
  const time = formatTime(slot, view.timeZone);
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <Panel className="animate-rise">
      <form action={act} className="space-y-3">
        <input type="hidden" name="intent" value="confirm" />
        <input type="hidden" name="slot" value={slot} />
        <input type="hidden" name="location" value={view.location || view.suggestedLocation} />
        <h2 ref={heading} tabIndex={-1} className="font-display text-2xl leading-tight outline-none">
          ¿Confirmas el <strong className="font-medium">{shortDay(slot, view.timeZone)}</strong> a las{" "}
          <strong className="font-medium text-signal-deep">{time}</strong>?
        </h2>
        <p className="text-sm text-ink-soft">
          Con {other} · {formatDuration(view.durationMinutes)} · {describeWhere(view)}
        </p>
        <SubmitButton pending={pending} pendingLabel="Confirmando…" icon={<CalendarCheck2 className="size-5" aria-hidden />}>
          {`Confirmar ${time}`}
        </SubmitButton>
        <InvitationNote view={view} />
      </form>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 border-t hairline pt-3 text-sm">
        {view.openSlots.length > 1 ? (
          <button type="button" onClick={onExpand} className="inline-flex min-h-11 items-center rounded-full px-3 font-medium text-ink hover:bg-paper-deep">
            Elegir otra de sus horas
          </button>
        ) : null}
        {view.actions.includes("counter") ? (
          <button type="button" onClick={() => onMode("counter")} className="inline-flex min-h-11 items-center rounded-full px-3 text-muted hover:text-ink">
            Proponer otras horas
          </button>
        ) : null}
        <button type="button" onClick={() => onMode("decline")} className="inline-flex min-h-11 items-center rounded-full px-3 text-muted hover:text-ink">
          No puedo
        </button>
      </div>
    </Panel>
  );
}

function CounterPanel({ view, act, pending, errors, onBack }: PanelProps & { onBack: () => void }) {
  const [slots, setSlots] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const now = useClientNow();
  const other = otherName(view);
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <Panel className="animate-rise">
      <form action={act} className="space-y-5" id="otra-hora">
        <input type="hidden" name="intent" value="counter" />
        {slots.map((iso) => (
          <input key={iso} type="hidden" name="slot" value={iso} />
        ))}
        <div>
          <h2 ref={heading} tabIndex={-1} className="font-display text-2xl leading-tight outline-none">
            Proponer otras horas
          </h2>
          <p className="mt-1 text-sm text-muted">
            Hasta tres ({timeZoneLabel(view.timeZone)}). {other} recibirá un email para elegir una.
          </p>
        </div>
        {now > 0 ? (
          <SlotPicker timeZone={view.timeZone} value={slots} onChange={setSlots} now={now} chooser={other} error={errors.slots} />
        ) : (
          <div className="h-72 animate-pulse rounded-2xl bg-paper-deep/60" aria-hidden />
        )}
        <NoteField label={`Un mensaje para ${other}`} placeholder="Esa semana no puedo, ¿te va alguna de estas?" value={note} onChange={setNote} error={errors.note} />
        <SubmitButton pending={pending} pendingLabel="Enviando…" icon={<CalendarClock className="size-5" aria-hidden />}>
          {slots.length > 1 ? `Enviar ${slots.length} horas` : "Enviar hora"}
        </SubmitButton>
      </form>
      <BackButton onClick={onBack} />
    </Panel>
  );
}

function DeclinePanel({ view, act, pending, errors, onBack }: PanelProps & { onBack: () => void }) {
  const [note, setNote] = useState("");
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <Panel className="animate-rise">
      <form action={act} className="space-y-4">
        <input type="hidden" name="intent" value="decline" />
        <div>
          <h2 ref={heading} tabIndex={-1} className="font-display text-2xl leading-tight outline-none">
            ¿No puedes en ninguna?
          </h2>
          <p className="mt-1 text-sm text-muted">Le avisamos a {otherName(view)} con un mensaje amable. Si quieres, añade una nota.</p>
        </div>
        <NoteField label="Nota" placeholder="Gracias, pero estas semanas voy muy liado." value={note} onChange={setNote} error={errors.note} />
        <SubmitButton pending={pending} pendingLabel="Enviando…">
          Enviar respuesta
        </SubmitButton>
      </form>
      <BackButton onClick={onBack} />
    </Panel>
  );
}

interface CancelBlockProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  act: Act;
  pending: boolean;
  label: string;
  error?: string;
}

/** Cancelling asks once more, with room for a note. */
function CancelBlock({ open, onOpen, onClose, act, pending, label, error }: CancelBlockProps) {
  const [note, setNote] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  // "No, mantener": close, then give focus back to the button that opened it (once it's back).
  function keep() {
    onClose();
    requestAnimationFrame(() => opener.current?.focus());
  }
  if (!open) {
    return (
      <button ref={opener} type="button" onClick={onOpen} className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-danger hover:bg-danger/10">
        <Undo2 className="size-4" aria-hidden />
        {label}
      </button>
    );
  }
  return (
    <form action={act} className="mt-4 animate-rise space-y-3 border-t hairline pt-4">
      <input type="hidden" name="intent" value="cancel" />
      <NoteField label="Nota" placeholder="Me ha surgido algo, ¿lo movemos?" value={note} onChange={setNote} error={error} autoFocus />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={keep}>
          No, mantener
        </Button>
        <SubmitButton pending={pending} pendingLabel="Cancelando…" variant="danger" size="md">
          Sí, {label.toLowerCase()}
        </SubmitButton>
      </div>
    </form>
  );
}

function WaitingPanel({ view, cancel }: { view: MeetingView; cancel: CancelBlockProps }) {
  return (
    <Panel>
      <p className="text-sm font-medium text-ink-soft">Horas propuestas</p>
      <ul className="mt-2 space-y-1.5">
        {view.openSlots.map((slot) => (
          <li key={slot} className="flex items-center gap-2 text-sm">
            <Clock className="size-3.5 text-muted" aria-hidden />
            <span className="first-letter:uppercase">
              {formatDay(slot, view.timeZone)}, {formatTime(slot, view.timeZone)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">Te escribiremos en cuanto {otherName(view)} elija una.</p>
      <CancelBlock {...cancel} />
    </Panel>
  );
}

function ConfirmedPanel({ view, icsHref, cancel }: { view: MeetingView; icsHref: string; cancel: CancelBlockProps }) {
  const google = viewGoogleCalendarUrl(view);
  return (
    <Panel>
      <p className="text-sm font-medium text-ink-soft">Añádela a tu calendario</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {google ? (
          <a href={google} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "ink" })}>
            Google Calendar
            <ArrowUpRight className="size-4" aria-hidden />
            <NewTabHint />
          </a>
        ) : null}
        <a href={icsHref} className={buttonClasses({ variant: "outline" })} download>
          <Download className="size-4" aria-hidden />
          Apple / Outlook
        </a>
      </div>
      <p className="mt-3 text-xs text-muted">
        También os llegó por email con la invitación adjunta.
        {view.format === "video" && !view.location ? " Pasaos el enlace de la videollamada respondiendo a ese correo." : ""}
      </p>
      <CancelBlock {...cancel} />
    </Panel>
  );
}

/** What this page is for later: the owner's editor, or the guest's link to come back to. */
function Footer({ view }: { view: MeetingView }) {
  if (view.party === "owner") {
    return (
      <p className="pt-2 text-center text-xs text-muted">
        Las propuestas de {displayName(view.guest)} también están en tu editor, en «Reuniones».
      </p>
    );
  }
  const text =
    view.stage === "awaiting"
      ? "Guarda este enlace: desde aquí puedes ver o cancelar tu propuesta."
      : view.stage === "confirmed"
        ? "Guarda este enlace: desde aquí puedes ver o cancelar la reunión."
        : null;
  return text ? <p className="pt-2 text-center text-xs text-muted">{text}</p> : null;
}

/**
 * One side of a meeting: answer a proposal (confirm with one tap, propose
 * other times, or decline), wait for the other side, or manage a confirmed
 * meeting. Every change happens in place, with the result announced.
 */
export function MeetingResponse({ id, signature, initial, preset, demo }: MeetingResponseProps) {
  const [state, act, pending] = useActionState<MeetingResponseState, FormData>(respondMeetingAction.bind(null, id, signature), { status: "idle" });
  const view = state.status === "done" ? state.view : initial;
  const canAnswer = view.actions.includes("confirm");

  const presetSlot = preset.slotIndex !== null ? initial.slots[preset.slotIndex] : undefined;
  const [selected, setSelected] = useState<string | null>(presetSlot && initial.openSlots.includes(presetSlot) ? presetSlot : (initial.openSlots[0] ?? null));
  const [mode, setModeState] = useState<Mode>(preset.mode && initial.actions.includes(preset.mode) ? preset.mode : "confirm");
  // Arriving from a time button in the email: ask about that time first.
  const [quick, setQuick] = useState(Boolean(presetSlot && initial.openSlots.includes(presetSlot) && !preset.mode && initial.actions.includes("confirm")));
  // The panel the person just left, so focus can return to the button that opened it.
  const [returnFocus, setReturnFocus] = useState<Mode | null>(null);
  const setMode = (next: Mode) => {
    setReturnFocus(next === "confirm" && mode !== "confirm" ? mode : null);
    setModeState(next);
  };

  // Back to the default view after every successful change.
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.status === "done") {
      setModeState("confirm");
      setReturnFocus(null);
      setSelected(state.view.openSlots[0] ?? null);
    }
  }

  const errors = state.status === "error" ? (state.errors ?? {}) : {};
  // Demo pages store nothing: each answer tells the server where the sample meeting stands.
  const send: Act = demo
    ? (formData) => {
        const { status, proposedBy, slots, confirmedStart, location, closedBy } = view;
        formData.set("demoState", JSON.stringify({ status, proposedBy, slots, confirmedStart, location, closedBy }));
        act(formData);
      }
    : act;
  const panel: PanelProps = { view, act: send, pending, errors };
  const cancel = (label: string): CancelBlockProps => ({
    open: mode === "cancel",
    onOpen: () => setMode("cancel"),
    onClose: () => setMode("confirm"),
    act: send,
    pending,
    label,
    error: errors.note,
  });

  const answering = view.stage === "awaiting" && canAnswer && mode === "confirm";
  const showQuick = answering && quick && selected !== null;

  return (
    <div className="mt-8 space-y-4">
      <header>
        <p className="eyebrow">Agendar reunión{demo ? " · demo" : ""}</p>
        <h1 className="mt-2 font-display text-[2.4rem] leading-[1] tracking-tight">
          <Title view={view} />
        </h1>
        {view.stage === "awaiting" && canAnswer && !showQuick ? (
          <p className="mt-3 text-ink-soft">
            {view.proposedBy === "guest"
              ? `Te propone ${view.openSlots.length === 1 ? "esta hora" : "estas horas"}. Elige una y le enviamos la invitación.`
              : "Elige la que te venga bien y os enviamos la invitación a los dos."}
          </p>
        ) : null}
      </header>

      <StatusBanner state={state} other={otherName(view)} />
      {showQuick && selected ? (
        <QuickConfirm
          {...panel}
          slot={selected}
          onExpand={() => setQuick(false)}
          onMode={(next) => {
            setQuick(false);
            setMode(next);
          }}
        />
      ) : null}
      <Summary view={view} />

      {answering && !showQuick ? (
        <ConfirmPanel {...panel} selected={selected} onSelect={setSelected} onMode={setMode} returnFocus={returnFocus} />
      ) : null}
      {view.stage === "awaiting" && canAnswer && mode === "counter" ? <CounterPanel {...panel} onBack={() => setMode("confirm")} /> : null}
      {view.stage === "awaiting" && canAnswer && mode === "decline" ? <DeclinePanel {...panel} onBack={() => setMode("confirm")} /> : null}
      {view.stage === "awaiting" && !canAnswer ? <WaitingPanel view={view} cancel={cancel("Cancelar propuesta")} /> : null}
      {view.stage === "confirmed" ? <ConfirmedPanel view={view} icsHref={`/reunion/${id}/${signature}/invitacion.ics`} cancel={cancel("Cancelar reunión")} /> : null}

      {view.party === "guest" && ["declined", "cancelled", "expired"].includes(view.stage) ? (
        <a
          href={`/u/${view.owner.slug}?reunion=1`}
          // The card's meeting form opens with these details already in.
          onClick={() =>
            rememberDetails(
              { fullName: view.guest.name, email: view.guest.email ?? "", phone: view.guest.phone ?? "", company: view.guest.company },
              view.owner.slug,
            )
          }
          className={buttonClasses({ variant: "signal", size: "lg", className: "w-full" })}
        >
          <CalendarClock className="size-5" aria-hidden />
          Proponer otras horas
        </a>
      ) : null}

      <Footer view={view} />
    </div>
  );
}

/** "(09:00, hora de Canarias, la de Marta)" under a time, only when the other side's clock reads differently. */
function OtherZone({ iso, view }: { iso: string; view: MeetingView }) {
  const other = otherZoneTime(iso, view.timeZone, view.otherTimeZone);
  if (!other) return null;
  const name = view.party === "owner" ? view.guest.name : view.owner.name;
  return <span className="block text-xs text-muted">({other}, la de {name.split(/\s+/)[0]})</span>;
}
