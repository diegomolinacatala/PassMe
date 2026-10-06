"use client";

import { ArrowUpRight, CalendarCheck2, CalendarClock, Hourglass, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { declineMeetingAction, deleteMeetingAction } from "@/app/dashboard/actions";
import { buttonClasses } from "@/components/ui/button";
import { InlineError } from "@/components/ui/field";
import { NEW_TAB_SUFFIX } from "@/components/ui/new-tab-hint";
import { undoKey, UndoNotice, type UndoItem } from "@/components/ui/undo-notice";
import { cn } from "@/lib/cn";
import { firstName } from "@/lib/meetings/model";
import { formatSlotShort } from "@/lib/meetings/time";
import { needsOwnerAnswer } from "@/lib/pending";
import type { MeetingStage } from "@/lib/meetings/state";
import type { MeetingView } from "@/lib/meetings/view";

export interface MeetingItem {
  view: MeetingView;
  /** The owner's signed page for this meeting (null without a signing secret). */
  href: string | null;
}

interface MeetingsPanelProps {
  items: MeetingItem[];
  /** False while the database migration for meetings is pending. */
  available: boolean;
  /** The saved card shows "Agendar reunión". */
  enabled: boolean;
  demo: boolean;
}

type Group = "answer" | "upcoming" | "waiting" | "closed";

const STAGE_LABEL: Record<MeetingStage, string> = {
  awaiting: "Pendiente",
  confirmed: "Confirmada",
  past: "Pasada",
  declined: "Rechazada",
  cancelled: "Cancelada",
  expired: "Caducada",
};

function groupOf(view: MeetingView): Group {
  if (view.stage === "awaiting") return needsOwnerAnswer(view) ? "answer" : "waiting";
  if (view.stage === "confirmed") return "upcoming";
  return "closed";
}

function summary(view: MeetingView): string {
  if (view.confirmedStart && (view.stage === "confirmed" || view.stage === "past")) {
    return formatSlotShort(view.confirmedStart, view.timeZone);
  }
  const slots = view.stage === "awaiting" ? view.openSlots : view.slots;
  if (slots.length === 0) return "";
  const first = formatSlotShort(slots[0]!, view.timeZone);
  return slots.length > 1 ? `${first} y ${slots.length - 1} más` : first;
}

/** Soonest first: the confirmed time, or the first time still on the table. */
function byDate(a: MeetingItem, b: MeetingItem): number {
  const when = ({ view }: MeetingItem) => view.confirmedStart ?? view.openSlots[0] ?? view.slots[0] ?? "";
  return when(a).localeCompare(when(b));
}

const ICON_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-full sm:size-10 text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger disabled:pointer-events-none";

interface ItemProps {
  item: MeetingItem;
  onDelete?: () => void;
  /** Unanswered proposals: the bin offers a kind "no" (the guest is told) or a silent removal. */
  onDecline?: () => void;
}

function Item({ item, onDelete, onDecline }: ItemProps) {
  const { view, href } = item;
  const group = groupOf(view);
  const label = group === "answer" ? "Responder" : "Ver";
  const [choosing, setChoosing] = useState(false);
  const firstChoice = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (choosing) firstChoice.current?.focus();
  }, [choosing]);
  return (
    <li className={cn("flex flex-wrap items-center gap-3 rounded-2xl px-3 py-3", group === "answer" && "bg-signal-wash/70")}>
      {/* Name and actions share a line; with a large font, the actions drop below. */}
      <div className="min-w-0 flex-[1_1_8rem]">
        <p className="truncate font-medium">
          {view.guest.name}
          {view.guest.company ? <span className="font-normal text-muted"> · {view.guest.company}</span> : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          {/* Only past meetings say how they ended; the others already sit under their group's title. */}
          {group === "closed" ? (
            <span className="eyebrow">{STAGE_LABEL[view.stage]}</span>
          ) : null}
          <span className="tabular-nums">{summary(view)}</span>
        </p>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: group === "answer" ? "ink" : "outline", size: "sm", className: "shrink-0" })}
          aria-label={`${label}: reunión con ${view.guest.name}${NEW_TAB_SUFFIX}`}
        >
          {label}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      ) : null}
      {onDelete && onDecline ? (
        <button
          type="button"
          onClick={() => setChoosing((open) => !open)}
          aria-expanded={choosing}
          className={ICON_BUTTON}
          aria-label={`Rechazar o quitar la propuesta de ${view.guest.name}`}
          title="Rechazar o quitar"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      ) : onDelete ? (
        <button type="button" onClick={onDelete} className={ICON_BUTTON} aria-label={`Quitar la reunión con ${view.guest.name}`} title="Quitar">
          <Trash2 className="size-4" aria-hidden />
        </button>
      ) : null}
      {choosing && onDelete && onDecline ? (
        <div role="group" aria-label={`Qué hacer con la propuesta de ${view.guest.name}`} className="flex w-full flex-col gap-1.5 sm:flex-row sm:flex-wrap">
          <button
            ref={firstChoice}
            type="button"
            onClick={() => {
              setChoosing(false);
              onDecline();
            }}
            className={buttonClasses({ variant: "outline", size: "sm", className: "h-auto min-h-11 justify-start py-2 text-left whitespace-normal" })}
          >
            <span>
              Decir que no <span className="font-normal text-muted">(le avisamos con un mensaje amable)</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setChoosing(false);
              onDelete();
            }}
            className={buttonClasses({ variant: "ghost", size: "sm", className: "min-h-11 justify-start" })}
          >
            Quitar sin avisar (es spam)
          </button>
        </div>
      ) : null}
    </li>
  );
}

const GROUPS: ReadonlyArray<{ id: Exclude<Group, "closed">; title: string; icon: typeof CalendarClock }> = [
  { id: "answer", title: "Te toca responder", icon: CalendarClock },
  { id: "upcoming", title: "Próximas", icon: CalendarCheck2 },
  { id: "waiting", title: "Esperando respuesta", icon: Hourglass },
];

/** The owner's meetings: what needs an answer first, then what's coming, then the rest. */
export function MeetingsPanel({ items, available, enabled, demo }: MeetingsPanelProps) {
  const [showClosed, setShowClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  // Proposals declined from here: shown as such until the next load brings them back declined.
  const [declined, setDeclined] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  // Your own list, nobody is told: no confirmation, but "Deshacer" for a few seconds before it's final.
  const [undo, setUndo] = useState<(UndoItem & { id: string }) | null>(null);
  const waiting = useRef<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = items
    .filter((i) => !removed.has(i.view.id))
    .map((i) =>
      declined.has(i.view.id) ? { ...i, view: { ...i.view, stage: "declined" as const, status: "declined" as const, closedBy: "owner" as const, actions: [] } } : i,
    );
  const closed = list.filter((i) => groupOf(i.view) === "closed");

  const unhide = (id: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  function commit(id: string) {
    waiting.current = null;
    if (demo) return;
    startTransition(async () => {
      const result = await deleteMeetingAction(id);
      if (!result.ok) {
        unhide(id);
        setError(result.error);
      }
    });
  }

  // Leaving the page during the countdown still removes it.
  useEffect(
    () => () => {
      if (waiting.current && !demo) void deleteMeetingAction(waiting.current);
    },
    [demo],
  );

  function decline(item: MeetingItem) {
    setError(null);
    setStatus(null);
    const { id } = item.view;
    const done = () => {
      setDeclined((prev) => new Set(prev).add(id));
      setStatus(`Le hemos dicho que no a ${firstName(item.view.guest.name)} con un mensaje amable.${demo ? " (Modo demo: no se ha enviado nada.)" : ""}`);
      requestAnimationFrame(() => panel.current?.focus());
    };
    if (demo) return done();
    startTransition(async () => {
      const result = await declineMeetingAction(id);
      if (result.ok) done();
      else setError(result.error);
    });
  }

  function remove(item: MeetingItem) {
    setError(null);
    setStatus(null);
    if (waiting.current) commit(waiting.current);
    waiting.current = item.view.id;
    setRemoved((prev) => new Set(prev).add(item.view.id));
    // The row is gone: keep the keyboard in the panel, not on <body>.
    requestAnimationFrame(() => panel.current?.focus());
    setUndo({ key: undoKey(item.view.id), id: item.view.id, message: `Reunión con ${firstName(item.view.guest.name)} quitada` });
  }

  if (!available) return <p className="text-sm text-muted">Esta función aún no está disponible.</p>;

  return (
    <div id="reuniones" ref={panel} tabIndex={-1} className="scroll-mt-6 outline-none">
      {list.length === 0 ? (
        <p className="text-sm text-muted">
          {enabled
            ? "Aún no te han propuesto ninguna. Cuando pase, te llegará un email para confirmarla con un toque y la verás aquí."
            : "Activa «Recibir propuestas de reunión» en Publicación: quien te escanee podrá proponerte día y hora."}
        </p>
      ) : (
        <div className="space-y-5">
          <p className="-mt-3 text-sm text-muted">{list.length === 1 ? "1 en total" : `${list.length} en total`}</p>
          {GROUPS.map(({ id, title, icon: Icon }) => {
            const group = list.filter((i) => groupOf(i.view) === id).sort(byDate);
            if (group.length === 0) return null;
            return (
              <div key={id}>
                <p className="eyebrow mb-1.5 flex items-center gap-1.5">
                  <Icon className="size-3.5" aria-hidden />
                  {title}
                </p>
                <ul className="-mx-3 space-y-1">
                  {group.map((item) => (
                    // Unanswered proposals can be cleared (spam); confirmed ones are cancelled from their page.
                    <Item
                      key={item.view.id}
                      item={item}
                      onDelete={id === "upcoming" ? undefined : () => remove(item)}
                      onDecline={id === "answer" ? () => decline(item) : undefined}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
          {closed.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                aria-expanded={showClosed}
                className="text-sm font-medium text-signal-deep underline-offset-4 hover:underline"
              >
                {showClosed ? "Ocultar anteriores" : `Ver anteriores (${closed.length})`}
              </button>
              {showClosed ? (
                <ul className="-mx-3 mt-2 space-y-1">
                  {closed.map((item) => (
                    <Item key={item.view.id} item={item} onDelete={() => remove(item)} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      <UndoNotice
        item={undo}
        onUndo={() => {
          if (undo) unhide(undo.id);
          waiting.current = null;
          setUndo(null);
        }}
        onExpire={() => {
          if (undo && waiting.current === undo.id) commit(undo.id);
          setUndo(null);
        }}
      />
      <p role="status" className="mt-3 text-sm text-ok empty:hidden">
        {status}
      </p>
      {error ? (
        <InlineError live className="mt-3">
          {error}
        </InlineError>
      ) : null}
    </div>
  );
}
