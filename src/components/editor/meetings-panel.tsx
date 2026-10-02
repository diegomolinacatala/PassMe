"use client";

import { ArrowUpRight, CalendarCheck2, CalendarClock, Hourglass, Trash2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { deleteMeetingAction } from "@/app/dashboard/actions";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatSlotShort } from "@/lib/meetings/time";
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
  if (view.stage === "awaiting") return view.actions.includes("confirm") ? "answer" : "waiting";
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
  "grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger disabled:pointer-events-none";

function Item({ item, onDelete }: { item: MeetingItem; onDelete?: () => void }) {
  const { view, href } = item;
  const group = groupOf(view);
  const label = group === "answer" ? "Responder" : "Ver";
  return (
    <li className={cn("flex items-center gap-3 rounded-2xl px-3 py-3", group === "answer" && "bg-signal-wash/70")}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {view.guest.name}
          {view.guest.company ? <span className="font-normal text-muted"> · {view.guest.company}</span> : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span
            className={cn(
              "font-mono text-[10px] tracking-[0.1em] uppercase",
              group === "answer" ? "text-signal-deep" : group === "upcoming" ? "text-ok" : "text-muted",
            )}
          >
            {group === "answer" ? "Te toca" : group === "waiting" ? "Esperando" : STAGE_LABEL[view.stage]}
          </span>
          <span className="tabular-nums">{summary(view)}</span>
        </p>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: group === "answer" ? "signal" : "outline", size: "sm", className: "shrink-0" })}
          aria-label={`${label}: reunión con ${view.guest.name}`}
        >
          {label}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      ) : null}
      {onDelete ? (
        <button type="button" onClick={onDelete} className={ICON_BUTTON} aria-label={`Quitar la reunión con ${view.guest.name}`} title="Quitar">
          <Trash2 className="size-4" aria-hidden />
        </button>
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
  const [visible, removeOptimistic] = useOptimistic(items, (list, id: string) => list.filter((i) => i.view.id !== id));
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const list = visible.filter((i) => !removed.has(i.view.id));
  const closed = list.filter((i) => groupOf(i.view) === "closed");

  function remove(item: MeetingItem) {
    if (!window.confirm(`¿Quitar la reunión con ${item.view.guest.name} de tu lista? No le avisaremos.`)) return;
    setError(null);
    if (demo) {
      setRemoved((prev) => new Set(prev).add(item.view.id));
      return;
    }
    startTransition(async () => {
      removeOptimistic(item.view.id);
      const result = await deleteMeetingAction(item.view.id);
      if (result.ok) setRemoved((prev) => new Set(prev).add(item.view.id));
      else setError(result.error);
    });
  }

  if (!available) {
    return (
      <p className="text-sm text-muted">
        Falta un paso en la base de datos para recibir reuniones (migración <code className="font-mono">20261002120000</code>).
      </p>
    );
  }

  return (
    <div id="reuniones" className="scroll-mt-6">
      {list.length === 0 ? (
        <p className="text-sm text-muted">
          {enabled
            ? "Aún no te han propuesto ninguna. Cuando pase, te llegará un email para confirmarla con un toque y la verás aquí."
            : "Activa «Deja que te propongan reuniones» en Publicación: quien te escanee podrá proponerte día y hora."}
        </p>
      ) : (
        <div className="space-y-5">
          {GROUPS.map(({ id, title, icon: Icon }) => {
            const group = list.filter((i) => groupOf(i.view) === id).sort(byDate);
            if (group.length === 0) return null;
            return (
              <div key={id}>
                <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
                  <Icon className="size-3.5" aria-hidden />
                  {title}
                </p>
                <ul className="-mx-3 space-y-1">
                  {group.map((item) => (
                    // Unanswered proposals can be cleared (spam); confirmed ones are cancelled from their page.
                    <Item key={item.view.id} item={item} onDelete={id === "upcoming" ? undefined : () => remove(item)} />
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
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
