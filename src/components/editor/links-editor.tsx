"use client";

import { EyeOff, GripVertical, Plus } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { LinkIcon } from "@/components/card/link-icon";
import { InlineError, inputClasses } from "@/components/ui/field";
import { undoKey, UndoNotice, type UndoItem } from "@/components/ui/undo-notice";
import { getLinkKind, type LinkKind } from "@/lib/card/links";
import { LIMITS, MAX_LINKS, type FieldErrors } from "@/lib/card/schema";
import type { CardLink } from "@/lib/card/types";
import { cn } from "@/lib/cn";
import { AddLinkField } from "./add-link-field";
import { LinkMenu } from "./link-menu";
import { useDragReorder } from "./use-drag-reorder";

/** Kinds with an optional title ("Portfolio"); a web without one shows its domain. */
const LABELLED_KINDS: ReadonlySet<LinkKind> = new Set(["website", "custom", "booking"]);
/** Kinds whose label is feminine in Spanish ("Web quitada"). */
const FEMININE_KINDS: ReadonlySet<LinkKind> = new Set(["website", "custom"]);

function removedMessage(kind: LinkKind): string {
  return `${getLinkKind(kind).label} ${FEMININE_KINDS.has(kind) ? "quitada" : "quitado"}`;
}

interface LinksEditorProps {
  links: CardLink[];
  /** Login email offered as a one-click first contact on empty cards. */
  suggestedEmail?: string | null;
  errors: FieldErrors;
  showErrors: boolean;
  onAdd: (kind: LinkKind, value?: string) => string;
  onUpdate: (id: string, patch: Partial<Omit<CardLink, "id">>) => void;
  onRemove: (id: string) => void;
  /** Puts a removed link back where it was ("Deshacer"). */
  onRestore: (link: CardLink, index: number) => void;
  onMoveTo: (id: string, index: number) => void;
  onDuplicate: (id: string) => string;
  /** The card takes meeting proposals: a booking link then lives inside "Agendar reunión". */
  takesMeetings?: boolean;
}

export function LinksEditor({ links, suggestedEmail, errors, showErrors, onAdd, onUpdate, onRemove, onRestore, onMoveTo, onDuplicate, takesMeetings }: LinksEditorProps) {
  const hintId = useId();
  const list = useRef<HTMLOListElement>(null);
  // Id of a link whose input should receive focus once it mounts.
  const pendingFocus = useRef<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  // Your own detail, easy to get back: no confirmation, "Teléfono quitado · Deshacer" instead.
  const [undo, setUndo] = useState<(UndoItem & { link: CardLink; index: number }) | null>(null);
  // Said out loud after a move or an addition (the visual change alone isn't enough).
  const [announcement, setAnnouncement] = useState("");

  const ids = links.map((link) => link.id);
  const settle = useCallback(
    (id: string, index: number) => {
      const link = links.find((l) => l.id === id);
      if (link) setAnnouncement(`${getLinkKind(link.kind).label} en la posición ${index + 1} de ${links.length}.`);
    },
    [links],
  );
  const { draggingId, handleProps } = useDragReorder({ ids, list, onMove: onMoveTo, onSettle: settle });

  // Removing a row moves focus to the next one (or the previous), or to the add field if it was the last.
  function remove(index: number) {
    const link = links[index]!;
    const next = links[index + 1] ?? links[index - 1];
    pendingFocus.current = next?.id ?? null;
    onRemove(link.id);
    setUndo({ key: undoKey(link.id), message: removedMessage(link.kind), link, index });
    if (!next) requestAnimationFrame(() => document.getElementById(`${hintId}-add`)?.querySelector("input")?.focus());
  }

  // Back in the same place, with the focus on its field.
  function restore() {
    if (!undo) return;
    pendingFocus.current = undo.link.id;
    onRestore(undo.link, undo.index);
    setUndo(null);
  }

  function add(kind: LinkKind, value: string, focus: boolean) {
    const id = onAdd(kind, value);
    if (focus) pendingFocus.current = id;
    setAnnouncement(`${getLinkKind(kind).label} añadido al final de la lista.`);
  }

  const full = links.length >= MAX_LINKS;
  const visibleCount = links.filter((l) => l.visible).length;

  return (
    <div>
      <p id={hintId} className="sr-only">
        Para moverlo, usa las flechas arriba y abajo.
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {links.length > 0 ? (
        <ol ref={list} className="space-y-2">
          {links.map((link, index) => {
            const def = getLinkKind(link.kind);
            const valueError = errors[`links.${index}.value`];
            const labelError = errors[`links.${index}.label`];
            const showValueError = Boolean(valueError) && (showErrors || (touched.has(link.id) && link.value !== ""));
            const dragging = draggingId === link.id;
            return (
              <li
                key={link.id}
                data-row-id={link.id}
                className={cn(
                  "relative flex items-start gap-1 rounded-2xl border bg-card p-1.5 transition-[border-color,box-shadow,opacity] duration-200",
                  link.visible ? "border-line" : "border-dashed border-line-strong/70 bg-paper/60",
                  dragging && "z-10 border-ink shadow-object",
                )}
              >
                <button
                  type="button"
                  aria-label={`Mover ${def.label}`}
                  aria-describedby={hintId}
                  title="Arrastra para mover"
                  {...handleProps(link.id)}
                  className={cn(
                    "grid size-11 shrink-0 touch-none place-items-center rounded-xl text-muted transition-colors select-none hover:bg-ink/[0.06] hover:text-ink",
                    dragging ? "cursor-grabbing" : "cursor-grab",
                  )}
                >
                  <GripVertical className="size-4" aria-hidden />
                </button>
                <span
                  className={cn(
                    "relative mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl",
                    link.visible ? "bg-ink text-paper" : "bg-line/60 text-muted",
                  )}
                  aria-hidden="true"
                >
                  <LinkIcon kind={link.kind} size={18} />
                  {!link.visible ? (
                    <span className="absolute -right-1 -bottom-1 grid size-4.5 place-items-center rounded-full bg-card text-ink-soft shadow-hairline">
                      <EyeOff className="size-3" />
                    </span>
                  ) : null}
                </span>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    ref={(el) => {
                      if (el && pendingFocus.current === link.id) {
                        pendingFocus.current = null;
                        el.focus();
                      }
                    }}
                    value={link.value}
                    onChange={(e) => onUpdate(link.id, { value: e.target.value })}
                    onBlur={() => setTouched((prev) => new Set(prev).add(link.id))}
                    placeholder={def.placeholder}
                    inputMode={def.inputMode}
                    type={def.inputMode === "email" ? "email" : "text"}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={LIMITS.linkValue}
                    aria-label={`${def.label}: valor`}
                    aria-describedby={link.visible ? undefined : `${hintId}-${link.id}-hidden`}
                    aria-invalid={showValueError}
                    className={inputClasses({ size: "sm" })}
                  />
                  {!link.visible ? (
                    <span id={`${hintId}-${link.id}-hidden`} className="sr-only">
                      Oculto: no sale en tu tarjeta.
                    </span>
                  ) : null}
                  {showValueError ? <InlineError live>{valueError}</InlineError> : null}

                  {LABELLED_KINDS.has(link.kind) ? (
                    <div>
                      <input
                        value={link.label ?? ""}
                        onChange={(e) => onUpdate(link.id, { label: e.target.value })}
                        placeholder="Título (opcional; si no, se ve el dominio)"
                        maxLength={LIMITS.linkLabel}
                        aria-label={`${def.label}: título`}
                        aria-invalid={Boolean(labelError) && showErrors}
                        className={inputClasses({ size: "sm" })}
                      />
                      {labelError && showErrors ? (
                        <InlineError live className="mt-1">
                          {labelError}
                        </InlineError>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <LinkMenu
                  label={def.label}
                  kind={link.kind}
                  visible={link.visible}
                  isFirst={index === 0}
                  canDuplicate={!full}
                  onToggleVisible={() => {
                    onUpdate(link.id, { visible: !link.visible });
                    setAnnouncement(link.visible ? `${def.label} oculto en la tarjeta.` : `${def.label} visible en la tarjeta.`);
                  }}
                  onMoveTop={() => {
                    onMoveTo(link.id, 0);
                    settle(link.id, 0);
                  }}
                  onChangeKind={(kind) => onUpdate(link.id, { kind })}
                  onDuplicate={() => {
                    pendingFocus.current = onDuplicate(link.id);
                  }}
                  onRemove={() => remove(index)}
                />
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
          <p>Añade al menos un dato de contacto: es lo que la gente verá al escanear tu QR.</p>
          {suggestedEmail ? (
            <button
              type="button"
              onClick={() => onAdd("email", suggestedEmail)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 font-medium text-paper transition-colors hover:bg-ink-soft"
            >
              <Plus className="size-4" aria-hidden /> Añadir {suggestedEmail}
            </button>
          ) : null}
        </div>
      )}

      <UndoNotice item={undo} onUndo={restore} onExpire={() => setUndo(null)} />

      {takesMeetings && links.some((link) => link.kind === "booking") ? (
        <p className="mt-3 rounded-2xl bg-paper-deep/70 px-3.5 py-2.5 text-sm text-ink-soft">
          Ya recibes propuestas de reunión. Con Calendly o Cal.com, la gente podrá elegir entre los dos: tu enlace de reservas aparece dentro de «Agendar reunión».
        </p>
      ) : null}

      <div id={`${hintId}-add`} className="mt-6">
        <p className="eyebrow mb-3">
          Añadir · {links.length}/{MAX_LINKS}
          {links.length > 0 ? ` · ${visibleCount} visibles` : ""}
        </p>
        <AddLinkField full={full} onAdd={add} />
      </div>
    </div>
  );
}
