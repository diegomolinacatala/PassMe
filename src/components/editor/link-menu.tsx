"use client";

import { ArrowLeft, ArrowUpToLine, Check, Copy, Eye, EyeOff, MoreHorizontal, Shapes, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { LinkIcon } from "@/components/card/link-icon";
import { EDITABLE_LINK_KINDS, getLinkKind, type LinkKind } from "@/lib/card/links";
import { cn } from "@/lib/cn";

interface LinkMenuProps {
  /** The detail's name ("Email"), for the button's label. */
  label: string;
  kind: LinkKind;
  visible: boolean;
  isFirst: boolean;
  canDuplicate: boolean;
  onToggleVisible: () => void;
  onMoveTop: () => void;
  onChangeKind: (kind: LinkKind) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/** Room the menu needs below its button; with less, it opens upwards. */
const MENU_ROOM_PX = 320;

const ITEM =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-body text-ink transition-colors hover:bg-ink/[0.05] focus-visible:bg-ink/[0.05] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal disabled:pointer-events-none disabled:opacity-40";

/**
 * The «⋯» of a contact detail: one 44 px button instead of four small ones.
 * An ARIA menu: arrows move, Escape closes and the focus goes back to «⋯».
 */
export function LinkMenu({ label, kind, visible, isFirst, canDuplicate, onToggleVisible, onMoveTop, onChangeKind, onDuplicate, onRemove }: LinkMenuProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"main" | "kind">("main");
  const [upwards, setUpwards] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("[role^=menuitem]:not(:disabled)") ?? []);

  // Opening (or switching to the list of kinds) puts the focus on the first item, or on the current kind.
  useEffect(() => {
    if (!open) return;
    const all = items();
    const checked = all.find((item) => item.getAttribute("aria-checked") === "true");
    (checked ?? all[0])?.focus();
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) close(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function toggle() {
    if (open) return close(true);
    const rect = trigger.current?.getBoundingClientRect();
    setUpwards(Boolean(rect && window.innerHeight - rect.bottom < MENU_ROOM_PX && rect.top > MENU_ROOM_PX));
    setMode("main");
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    setMode("main");
    if (returnFocus) trigger.current?.focus();
  }

  function run(action: () => void, returnFocus = true) {
    close(returnFocus);
    action();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown" ? (index + 1) % all.length
      : event.key === "ArrowUp" ? (index - 1 + all.length) % all.length
      : event.key === "Home" ? 0
      : event.key === "End" ? all.length - 1
      : null;
    if (next !== null) {
      event.preventDefault();
      all[next]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (mode === "kind") setMode("main");
      else close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={`Opciones de ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
        className="grid size-11 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </button>
      {open ? (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={mode === "kind" ? "Cambiar tipo" : `Opciones de ${label}`}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute right-0 z-30 max-h-[min(70dvh,26rem)] w-64 overflow-y-auto rounded-2xl border hairline bg-card p-1.5 shadow-object",
            upwards ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {mode === "main" ? (
            <>
              <MenuItem icon={visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />} onSelect={() => run(onToggleVisible)}>
                {visible ? "Ocultar de la tarjeta" : "Mostrar en la tarjeta"}
              </MenuItem>
              <MenuItem icon={<ArrowUpToLine className="size-4" />} disabled={isFirst} onSelect={() => run(onMoveTop)}>
                Subir al principio
              </MenuItem>
              <MenuItem icon={<Shapes className="size-4" />} onSelect={() => setMode("kind")} hasPopup>
                Cambiar tipo…
              </MenuItem>
              <MenuItem icon={<Copy className="size-4" />} disabled={!canDuplicate} onSelect={() => run(onDuplicate, false)}>
                Duplicar
              </MenuItem>
              <div role="separator" className="my-1 border-t hairline" />
              <MenuItem icon={<Trash2 className="size-4" />} danger onSelect={() => run(onRemove, false)}>
                Quitar
              </MenuItem>
            </>
          ) : (
            <>
              <MenuItem icon={<ArrowLeft className="size-4" />} onSelect={() => setMode("main")}>
                Volver
              </MenuItem>
              <div role="separator" className="my-1 border-t hairline" />
              {EDITABLE_LINK_KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option === kind}
                  onClick={() => run(() => onChangeKind(option))}
                  className={ITEM}
                >
                  <LinkIcon kind={option} size={16} />
                  <span className="min-w-0 flex-1">{getLinkKind(option).label}</span>
                  {option === kind ? <Check className="size-4 text-ink" aria-hidden /> : null}
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface MenuItemProps {
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  hasPopup?: boolean;
  children: ReactNode;
}

function MenuItem({ icon, onSelect, disabled, danger, hasPopup, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-haspopup={hasPopup ? "menu" : undefined}
      disabled={disabled}
      onClick={onSelect}
      className={cn(ITEM, danger && "text-danger hover:bg-danger-wash focus-visible:bg-danger-wash")}
    >
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      {children}
    </button>
  );
}
