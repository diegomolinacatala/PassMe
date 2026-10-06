"use client";

import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { LinkIcon } from "@/components/card/link-icon";
import { InlineError, inputClasses } from "@/components/ui/field";
import { undoKey, UndoNotice, type UndoItem } from "@/components/ui/undo-notice";
import { getLinkKind, LINK_KINDS, type LinkKind } from "@/lib/card/links";
import { LIMITS, MAX_LINKS, type FieldErrors } from "@/lib/card/schema";
import type { CardLink } from "@/lib/card/types";
import { cn } from "@/lib/cn";

const LABELLED_KINDS: ReadonlySet<LinkKind> = new Set(["custom", "website", "booking"]);
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
  onAdd: (kind: LinkKind) => string;
  onUpdate: (id: string, patch: Partial<Omit<CardLink, "id">>) => void;
  onRemove: (id: string) => void;
  /** Puts a removed link back where it was ("Deshacer"). */
  onRestore: (link: CardLink, index: number) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  /** The card takes meeting proposals: a booking link then lives inside "Agendar reunión". */
  takesMeetings?: boolean;
}

export function LinksEditor({ links, suggestedEmail, errors, showErrors, onAdd, onUpdate, onRemove, onRestore, onMove, takesMeetings }: LinksEditorProps) {
  // Id of a just-added link whose input should receive focus once it mounts.
  const pendingFocus = useRef<string | null>(null);
  const addFirst = useRef<HTMLButtonElement>(null);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  // Your own detail, easy to get back: no confirmation, "Teléfono quitado · Deshacer" instead.
  const [undo, setUndo] = useState<(UndoItem & { link: CardLink; index: number }) | null>(null);

  // Removing a row moves focus to the next one (or the previous), or to "Añadir" if it was the last.
  function remove(index: number) {
    const link = links[index]!;
    const next = links[index + 1] ?? links[index - 1];
    pendingFocus.current = next?.id ?? null;
    onRemove(link.id);
    setUndo({ key: undoKey(link.id), message: removedMessage(link.kind), link, index });
    if (!next) requestAnimationFrame(() => addFirst.current?.focus());
  }

  // Back in the same place, with the focus on its field.
  function restore() {
    if (!undo) return;
    pendingFocus.current = undo.link.id;
    onRestore(undo.link, undo.index);
    setUndo(null);
  }

  const full = links.length >= MAX_LINKS;
  const visibleCount = links.filter((l) => l.visible).length;

  return (
    <div>
      {links.length > 0 ? (
        <ol className="space-y-3">
          {links.map((link, index) => {
            const def = getLinkKind(link.kind);
            const valueError = errors[`links.${index}.value`];
            const labelError = errors[`links.${index}.label`];
            const showValueError = Boolean(valueError) && (showErrors || (touched.has(link.id) && link.value !== ""));
            return (
              <li
                key={link.id}
                className={cn(
                  "group rounded-2xl border bg-card p-3 transition-[border-color,opacity] duration-300 sm:p-3.5",
                  link.visible ? "border-line" : "border-dashed border-line-strong/70 bg-paper/60",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <label
                    className={cn(
                      "relative mt-0.5 grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl transition-colors",
                      link.visible ? "bg-ink text-paper" : "bg-line/60 text-muted",
                    )}
                    title="Cambiar tipo"
                  >
                    <LinkIcon kind={link.kind} size={18} />
                    <span className="sr-only">Tipo</span>
                    <select
                      value={link.kind}
                      onChange={(e) => onUpdate(link.id, { kind: e.target.value as LinkKind })}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    >
                      {LINK_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {getLinkKind(kind).label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="eyebrow mb-1">
                        {def.label}
                        {!link.visible ? " · oculto" : ""}
                      </p>
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
                        aria-invalid={showValueError}
                        className={inputClasses({ size: "sm" })}
                      />
                      {showValueError ? (
                        <InlineError live className="mt-1">
                          {valueError}
                        </InlineError>
                      ) : null}
                    </div>

                    {LABELLED_KINDS.has(link.kind) ? (
                      <div>
                        <input
                          value={link.label ?? ""}
                          onChange={(e) => onUpdate(link.id, { label: e.target.value })}
                          placeholder={link.kind === "custom" ? "Título (obligatorio)" : "Título (opcional, p. ej. «Portfolio»)"}
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

                  <div className="flex shrink-0 flex-col items-center gap-0.5 sm:flex-row">
                    <IconButton
                      label={link.visible ? "Ocultar de la tarjeta" : "Mostrar en la tarjeta"}
                      onClick={() => onUpdate(link.id, { visible: !link.visible })}
                      active={!link.visible}
                    >
                      {link.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </IconButton>
                    <IconButton label="Subir" onClick={() => onMove(link.id, -1)} disabled={index === 0}>
                      <ChevronUp className="size-4" />
                    </IconButton>
                    <IconButton label="Bajar" onClick={() => onMove(link.id, 1)} disabled={index === links.length - 1}>
                      <ChevronDown className="size-4" />
                    </IconButton>
                    <IconButton label={`Quitar ${def.label}`} onClick={() => remove(index)} danger>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>
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
              onClick={() => onUpdate(onAdd("email"), { value: suggestedEmail })}
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

      <div className="mt-5">
        <p className="eyebrow mb-3">
          Añadir · {links.length}/{MAX_LINKS}
          {links.length > 0 ? ` · ${visibleCount} visibles` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {LINK_KINDS.map((kind, i) => (
            <button
              key={kind}
              ref={i === 0 ? addFirst : undefined}
              type="button"
              disabled={full}
              onClick={() => {
                pendingFocus.current = onAdd(kind);
              }}
              className="group inline-flex min-h-11 items-center gap-1.5 rounded-full border border-field-border bg-card py-1 pr-3.5 pl-2.5 text-sm transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-ink disabled:opacity-40"
            >
              <Plus className="size-3.5 text-muted transition-colors group-hover:text-signal" aria-hidden />
              <LinkIcon kind={kind} size={15} />
              {getLinkKind(kind).label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  children: React.ReactNode;
}

function IconButton({ label, onClick, disabled, danger, active, children }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-muted transition-colors disabled:opacity-25",
        danger ? "hover:bg-danger-wash hover:text-danger" : "hover:bg-ink/[0.06] hover:text-ink",
        active && "text-signal-deep",
      )}
    >
      {children}
    </button>
  );
}
