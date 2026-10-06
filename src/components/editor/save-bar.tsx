"use client";

import { CircleAlert, CircleCheck, LoaderCircle, TriangleAlert, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { CardDraft } from "./use-card-draft";

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saved"; at: number }
  // Saved, but the database couldn't store the new design yet (a migration is pending).
  | { kind: "partial" }
  | { kind: "error"; message: string }
  | { kind: "demo" }
  // "Descartar" went back to the saved card; the discarded draft can come back ("Deshacer").
  | { kind: "discarded"; draft: CardDraft };

const subscribeNoop = () => () => {};

/** "⌘S" on Apple devices, "Ctrl S" elsewhere (null while rendering on the server). */
function useSaveShortcut(): string | null {
  return useSyncExternalStore(
    subscribeNoop,
    () => (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘S" : "Ctrl S"),
    () => null,
  );
}

/** CSS variable with the height of a fixed bottom element (0 when it isn't there). */
export function useBottomInsetVar(name: string, element: HTMLElement | null, visible: boolean) {
  useEffect(() => {
    if (!visible || !element) return;
    const html = document.documentElement;
    const apply = () => html.style.setProperty(name, `${element.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => {
      observer.disconnect();
      html.style.removeProperty(name);
    };
  }, [element, name, visible]);
}

/**
 * Keeps a focused field from ending up under the fixed save bar or the preview
 * pill (WCAG 2.4.11): both publish their height as CSS variables.
 */
export function useEditorScrollPadding() {
  useEffect(() => {
    const html = document.documentElement;
    html.style.scrollPaddingBottom = "calc(var(--savebar-h, 0px) + var(--pill-h, 0px) + 16px)";
    return () => {
      html.style.scrollPaddingBottom = "";
    };
  }, []);
}

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  status: SaveStatus;
  errorCount: number;
  onSave: () => void;
  onDiscard: () => void;
  onUndoDiscard: () => void;
  onNextError: () => void;
}

/**
 * Slides up with the first change and stays while there's something to say:
 * unsaved changes, saving, an error, or "Guardado" for a moment. Otherwise it
 * isn't there, so it never covers the welcome, the QR or a field.
 */
export function SaveBar({ dirty, saving, status, errorCount, onSave, onDiscard, onUndoDiscard, onNextError }: SaveBarProps) {
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const shortcut = useSaveShortcut();
  const visible = dirty || saving || (status.kind === "error" ? errorCount > 0 : status.kind !== "idle");
  const discarded = status.kind === "discarded" && !dirty;
  useBottomInsetVar("--savebar-h", bar, visible);

  // "Descartar" disappears with the changes: the focus goes to "Deshacer", in the same place.
  useEffect(() => {
    if (discarded && bar?.contains(document.activeElement) === false && document.activeElement === document.body) {
      undoButton.current?.focus();
    }
  }, [bar, discarded]);

  const message = saving
    ? "Guardando…"
    : status.kind === "error" && (dirty || errorCount > 0)
      ? status.message
      : dirty
        ? "Cambios sin guardar"
        : status.kind === "discarded"
          ? "Cambios descartados: tu tarjeta está como la guardaste."
          : status.kind === "partial"
            ? "Guardado, salvo algunas opciones nuevas: falta actualizar la base de datos."
            : status.kind === "saved"
              ? "Guardado. Los pases se actualizarán en unos segundos."
              : status.kind === "demo"
                ? "Modo demo: los cambios no se guardan."
                : "Todo guardado";

  const tone =
    status.kind === "error" && (dirty || errorCount > 0) ? "error" : dirty ? "dirty" : status.kind === "partial" ? "warn" : "ok";

  return (
    <div
      ref={setBar}
      // Out of the tab order and hidden from screen readers while it's off screen.
      inert={!visible}
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-200 ease-[var(--ease-out-expo)] sm:px-6 sm:pb-5",
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0",
      )}
    >
      {/* On desktop the bar sits under the form column, clear of the preview. */}
      <div className="mx-auto max-w-[1240px] lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8 lg:px-2 xl:gap-12">
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-object border py-2 pr-2 pl-5 shadow-object backdrop-blur-md transition-colors duration-300 max-lg:mx-auto max-lg:max-w-[640px]",
            visible && "pointer-events-auto",
            tone === "dirty" ? "border-ink bg-ink text-paper" : "hairline bg-card/90 text-ink",
          )}
        >
          <div className="flex min-w-[min(12rem,100%)] flex-1 items-center gap-3">
            {tone === "error" ? <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden /> : null}
            {tone === "warn" ? <TriangleAlert className="size-4 shrink-0 text-signal-deep" aria-hidden /> : null}
            {tone === "ok" ? <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden /> : null}
            {tone === "dirty" ? <span className="size-2 shrink-0 animate-pulse rounded-full bg-signal" aria-hidden /> : null}
            <p className="line-clamp-2 min-w-0 flex-1 text-sm" role="status" aria-live="polite">
              {message}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {tone === "error" && errorCount > 1 ? (
              <Button variant="ghost" size="sm" onClick={onNextError}>
                Ver
              </Button>
            ) : null}
            {shortcut ? (
              <span className="hidden font-mono text-mark tracking-widest opacity-60 sm:inline" aria-hidden>
                {shortcut}
              </span>
            ) : null}
            {dirty && !saving ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDiscard}
                className={tone === "dirty" ? "text-paper hover:bg-paper/10" : undefined}
              >
                Descartar
              </Button>
            ) : null}
            {discarded ? (
              <Button ref={undoButton} variant="ghost" size="sm" onClick={onUndoDiscard}>
                <Undo2 className="size-4" aria-hidden />
                Deshacer
              </Button>
            ) : (
              <Button
                variant={tone === "dirty" ? "signal" : "ink"}
                size="sm"
                onClick={onSave}
                disabled={saving || (!dirty && tone !== "error")}
              >
                {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
