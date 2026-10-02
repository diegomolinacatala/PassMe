"use client";

import { ArrowLeft, CalendarCheck2, CalendarClock, CalendarX2, Check, CircleCheck, Clock, Download, LoaderCircle, Mail, Phone, Undo2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { respondMeetingAction, type MeetingResponseState } from "@/app/reunion/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { contactEmailHref, contactPhoneHref } from "@/lib/card/contact";
import type { FieldErrors } from "@/lib/card/schema";
import { cn } from "@/lib/cn";
import { describeWhere, displayName, firstName, formatDuration } from "@/lib/meetings/model";
import { MEETING_LIMITS } from "@/lib/meetings/schema";
import type { MeetingAction } from "@/lib/meetings/state";
import { addMinutes, formatDay, formatTime, timeZoneCity } from "@/lib/meetings/time";
import { viewGoogleCalendarUrl, type MeetingView } from "@/lib/meetings/view";
import { Field, MEETING_INPUT } from "./form-bits";
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
  return <section className={cn("rounded-[24px] border hairline bg-card px-5 py-5", className)}>{children}</section>;
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
      return view.closedBy === view.party ? <>Reunión cancelada</> : <>{other} ha cancelado</>;
    case "expired":
      return <>Las horas propuestas ya pasaron</>;
  }
}

function StatusBanner({ state, other }: { state: MeetingResponseState; other: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "idle") ref.current?.focus();
  }, [state]);
  if (state.status === "idle") return null;
  const error = state.status === "error";
  return (
    <p
      ref={ref}
      tabIndex={-1}
      role={error ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm outline-none", error ? "bg-danger-wash text-danger" : "bg-ok/10 text-ok")}
    >
      {error ? null : <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>
        {error ? state.message : DONE_MESSAGES[state.action](other)}
        {state.status === "done" && state.demo ? " (Modo demo: no se ha enviado nada.)" : ""}
      </span>
    </p>
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
      <dt className="w-20 shrink-0 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">{label}</dt>
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
          </Fact>
        ) : null}
        <Fact label="Cómo">
          <span className="flex items-start gap-1.5">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0">{describeWhere(view)}</span>
          </span>
        </Fact>
        <Fact label="Duración">{formatDuration(view.durationMinutes)}</Fact>
        {view.topic ? <Fact label="Tema">{view.topic}</Fact> : null}
      </dl>
      {view.responseNote ? (
        <blockquote className="mt-4 border-l-2 border-glow pl-3 text-sm text-ink-soft">
          <p className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">{noteByMe ? "Tu nota" : otherName(view)}</p>
          <p className="mt-0.5 whitespace-pre-line">{view.responseNote}</p>
        </blockquote>
      ) : null}
    </Panel>
  );
}

function NoteField({ label, placeholder, value, onChange, error }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label={label} optional error={error}>
      {(props) => (
        <textarea
          {...props}
          name="note"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={MEETING_LIMITS.note}
          placeholder={placeholder}
          className={cn(MEETING_INPUT, "resize-y py-2.5")}
        />
      )}
    </Field>
  );
}

function SubmitButton({ pending, children, variant = "signal", icon }: { pending: boolean; children: ReactNode; variant?: "signal" | "ink"; icon?: ReactNode }) {
  return (
    <Button type="submit" variant={variant} size="lg" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </Button>
  );
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
function ConfirmPanel({ view, act, pending, errors, selected, onSelect, onMode }: PanelProps & { selected: string | null; onSelect: (slot: string) => void; onMode: (mode: Mode) => void }) {
  const [location, setLocation] = useState(view.location);
  const other = otherName(view);
  return (
    <Panel className="animate-rise">
      <form action={act} className="space-y-4">
        <input type="hidden" name="intent" value="confirm" />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-soft">
            Elige una hora <span className="font-normal text-muted">(hora de {timeZoneCity(view.timeZone)})</span>
          </legend>
          <div className="space-y-2">
            {view.openSlots.map((slot) => {
              const checked = slot === selected;
              return (
                <label
                  key={slot}
                  className={cn(
                    "flex min-h-16 cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-3 transition-[background-color,border-color,box-shadow] duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/40",
                    checked ? "border-ink bg-paper shadow-soft" : "border-line bg-card hover:border-ink",
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
                maxLength={view.format === "video" ? MEETING_LIMITS.videoLink : MEETING_LIMITS.location}
                placeholder={view.format === "video" ? "https://meet.google.com/…" : "Café Central, Madrid"}
                className={cn(MEETING_INPUT, "h-11")}
              />
            )}
          </Field>
        )}

        <SubmitButton pending={pending} icon={<CalendarCheck2 className="size-5" aria-hidden />}>
          {pending ? "Confirmando…" : selected ? `Confirmar ${formatTime(selected, view.timeZone)}` : "Confirmar"}
        </SubmitButton>
        <p className="text-center text-xs text-muted">
          {view.party === "owner" ? `${other} recibirá la invitación con tu email para que podáis hablar.` : "Os enviamos la invitación a los dos."}
        </p>
      </form>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t hairline pt-4">
        {view.actions.includes("counter") ? (
          <Button variant="outline" onClick={() => onMode("counter")}>
            <CalendarClock className="size-4" aria-hidden />
            Otra hora
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => onMode("decline")} className={view.actions.includes("counter") ? "" : "col-span-2"}>
          <CalendarX2 className="size-4" aria-hidden />
          No puedo
        </Button>
      </div>
    </Panel>
  );
}

function CounterPanel({ view, act, pending, errors, onBack }: PanelProps & { onBack: () => void }) {
  const [slots, setSlots] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const now = useClientNow();
  const other = otherName(view);
  return (
    <Panel className="animate-rise">
      <form action={act} className="space-y-5" id="otra-hora">
        <input type="hidden" name="intent" value="counter" />
        {slots.map((iso) => (
          <input key={iso} type="hidden" name="slot" value={iso} />
        ))}
        <div>
          <h2 className="font-display text-2xl leading-tight">Propón otras horas</h2>
          <p className="mt-1 text-sm text-muted">
            Hasta tres (hora de {timeZoneCity(view.timeZone)}). {other} recibirá un email para elegir una.
          </p>
        </div>
        {now > 0 ? (
          <SlotPicker timeZone={view.timeZone} value={slots} onChange={setSlots} now={now} chooser={other} error={errors.slots} />
        ) : (
          <div className="h-72 animate-pulse rounded-2xl bg-paper-deep/60" aria-hidden />
        )}
        <NoteField label={`Un mensaje para ${other}`} placeholder="Esa semana no puedo, ¿te va alguna de estas?" value={note} onChange={setNote} error={errors.note} />
        <SubmitButton pending={pending} icon={<CalendarClock className="size-5" aria-hidden />}>
          {pending ? "Enviando…" : slots.length > 1 ? `Enviar ${slots.length} horas` : "Enviar hora"}
        </SubmitButton>
      </form>
      <BackButton onClick={onBack} />
    </Panel>
  );
}

function DeclinePanel({ view, act, pending, errors, onBack }: PanelProps & { onBack: () => void }) {
  const [note, setNote] = useState("");
  return (
    <Panel className="animate-rise">
      <form action={act} className="space-y-4">
        <input type="hidden" name="intent" value="decline" />
        <div>
          <h2 className="font-display text-2xl leading-tight">¿No puedes en ninguna?</h2>
          <p className="mt-1 text-sm text-muted">Le avisamos a {otherName(view)} con un mensaje amable. Si quieres, añade una nota.</p>
        </div>
        <NoteField label="Nota" placeholder="Gracias, pero estas semanas voy muy liado." value={note} onChange={setNote} error={errors.note} />
        <SubmitButton pending={pending} variant="ink">
          {pending ? "Enviando…" : "Enviar respuesta"}
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
  if (!open) {
    return (
      <button type="button" onClick={onOpen} className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-danger hover:bg-danger/10">
        <Undo2 className="size-4" aria-hidden />
        {label}
      </button>
    );
  }
  return (
    <form action={act} className="mt-4 animate-rise space-y-3 border-t hairline pt-4">
      <input type="hidden" name="intent" value="cancel" />
      <NoteField label="Nota" placeholder="Me ha surgido algo, ¿lo movemos?" value={note} onChange={setNote} error={error} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          No, mantener
        </Button>
        <Button type="submit" variant="danger" disabled={pending} aria-busy={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Sí, {label.toLowerCase()}
        </Button>
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
  const [mode, setMode] = useState<Mode>(preset.mode && initial.actions.includes(preset.mode) ? preset.mode : "confirm");

  // Back to the default view after every successful change.
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.status === "done") {
      setMode("confirm");
      setSelected(state.view.openSlots[0] ?? null);
    }
  }

  const errors = state.status === "error" ? (state.errors ?? {}) : {};
  const panel: PanelProps = { view, act, pending, errors };
  const cancel = (label: string): CancelBlockProps => ({
    open: mode === "cancel",
    onOpen: () => setMode("cancel"),
    onClose: () => setMode("confirm"),
    act,
    pending,
    label,
    error: errors.note,
  });

  return (
    <div className="mt-8 space-y-4">
      <header>
        <p className="eyebrow">Agendar reunión{demo ? " · demo" : ""}</p>
        <h1 className="mt-2 font-display text-[2.4rem] leading-[1] tracking-tight">
          <Title view={view} />
        </h1>
        {view.stage === "awaiting" && canAnswer ? (
          <p className="mt-3 text-ink-soft">
            {view.proposedBy === "guest"
              ? `Te propone ${view.openSlots.length === 1 ? "esta hora" : "estas horas"}. Elige una y le enviamos la invitación.`
              : "Elige la que te venga bien y os enviamos la invitación a los dos."}
          </p>
        ) : null}
      </header>

      <StatusBanner state={state} other={otherName(view)} />
      <Summary view={view} />

      {view.stage === "awaiting" && canAnswer && mode === "confirm" ? (
        <ConfirmPanel {...panel} selected={selected} onSelect={setSelected} onMode={setMode} />
      ) : null}
      {view.stage === "awaiting" && canAnswer && mode === "counter" ? <CounterPanel {...panel} onBack={() => setMode("confirm")} /> : null}
      {view.stage === "awaiting" && canAnswer && mode === "decline" ? <DeclinePanel {...panel} onBack={() => setMode("confirm")} /> : null}
      {view.stage === "awaiting" && !canAnswer ? <WaitingPanel view={view} cancel={cancel("Retirar propuesta")} /> : null}
      {view.stage === "confirmed" ? <ConfirmedPanel view={view} icsHref={`/reunion/${id}/${signature}/invitacion.ics`} cancel={cancel("Cancelar reunión")} /> : null}

      {view.party === "guest" && ["declined", "cancelled", "expired"].includes(view.stage) ? (
        <a href={`/u/${view.owner.slug}`} className={buttonClasses({ variant: "signal", size: "lg", className: "w-full" })}>
          <CalendarClock className="size-5" aria-hidden />
          Proponer otra fecha
        </a>
      ) : null}

      <p className="pt-2 text-center text-xs text-muted">
        {view.party === "owner"
          ? `Las propuestas de ${displayName(view.guest)} también están en tu editor, en «Reuniones».`
          : "Guarda este enlace: desde aquí puedes ver o cancelar la reunión."}
      </p>
    </div>
  );
}
