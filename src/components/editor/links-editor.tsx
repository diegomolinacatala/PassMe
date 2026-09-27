"use client";

import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { LinkIcon } from "@/components/card/link-icon";
import { getLinkKind, LINK_KINDS, type LinkKind } from "@/lib/card/links";
import { LIMITS, MAX_LINKS, type FieldErrors } from "@/lib/card/schema";
import type { CardLink } from "@/lib/card/types";
import { cn } from "@/lib/cn";
import { INPUT_CLASSES } from "./fields";

const LABELLED_KINDS: ReadonlySet<LinkKind> = new Set(["custom", "website", "booking"]);

interface LinksEditorProps {
  links: CardLink[];
  /** Login email offered as a one-click first contact on empty cards. */
  suggestedEmail?: string | null;
  errors: FieldErrors;
  showErrors: boolean;
  onAdd: (kind: LinkKind) => string;
  onUpdate: (id: string, patch: Partial<Omit<CardLink, "id">>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

export function LinksEditor({ links, suggestedEmail, errors, showErrors, onAdd, onUpdate, onRemove, onMove }: LinksEditorProps) {
  // Id of a just-added link whose input should receive focus once it mounts.
  const pendingFocus = useRef<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());

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
                    <span className="sr-only">Tipo de enlace</span>
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
                      <p className="mb-1 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
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
                        className={cn(INPUT_CLASSES, "h-10")}
                      />
                      {showValueError ? (
                        <p className="mt-1 text-xs text-danger" role="alert">
                          {valueError}
                        </p>
                      ) : null}
                    </div>

                    {LABELLED_KINDS.has(link.kind) ? (
                      <div>
                        <input
                          value={link.label ?? ""}
                          onChange={(e) => onUpdate(link.id, { label: e.target.value })}
                          placeholder={link.kind === "custom" ? "Título (obligatorio)" : `Título (opcional, p. ej. "Portfolio")`}
                          maxLength={LIMITS.linkLabel}
                          aria-label={`${def.label}: título`}
                          aria-invalid={Boolean(labelError) && showErrors}
                          className={cn(INPUT_CLASSES, "h-9 text-sm")}
                        />
                        {labelError && showErrors ? (
                          <p className="mt-1 text-xs text-danger" role="alert">
                            {labelError}
                          </p>
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
                    <IconButton label="Eliminar enlace" onClick={() => onRemove(link.id)} danger>
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
          <p>Añade al menos un contacto: es lo que la gente verá al escanear tu QR.</p>
          {suggestedEmail ? (
            <button
              type="button"
              onClick={() => onUpdate(onAdd("email"), { value: suggestedEmail })}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 font-medium text-paper transition-colors hover:bg-ink-soft"
            >
              <Plus className="size-4" aria-hidden /> Añadir {suggestedEmail}
            </button>
          ) : null}
        </div>
      )}

      <div className="mt-5">
        <p className="eyebrow mb-3">
          Añadir contacto · {links.length}/{MAX_LINKS}
          {links.length > 0 ? ` · ${visibleCount} visibles` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {LINK_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={full}
              onClick={() => {
                pendingFocus.current = onAdd(kind);
              }}
              className="group inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-card pr-3.5 pl-2.5 text-sm transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-ink disabled:opacity-40"
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
