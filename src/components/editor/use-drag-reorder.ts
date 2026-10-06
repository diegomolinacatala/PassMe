"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { dropIndex } from "@/lib/reorder";

/** Mouse: movement before a press becomes a drag. Touch: how long to hold, and how much the finger may wander meanwhile. */
const MOUSE_THRESHOLD_PX = 4;
const LONG_PRESS_MS = 250;
const LONG_PRESS_SLOP_PX = 10;
/** Near the screen's edges the page scrolls by itself while dragging. */
const EDGE_PX = 72;
const EDGE_SPEED_PX = 10;

interface Options {
  /** Row ids in their current order. */
  ids: ReadonlyArray<string>;
  /** The element that holds the rows (each row carries `data-row-id`). */
  list: RefObject<HTMLElement | null>;
  onMove: (id: string, index: number) => void;
  /** After a drag or a keyboard move: where it ended up (for the announcement). */
  onSettle: (id: string, index: number) => void;
}

interface DragState {
  id: string;
  pointerId: number;
  pointerType: string;
  startY: number;
  pointerY: number;
  /** Pointer distance from the row's top when the drag started. */
  grab: number;
  active: boolean;
  timer: number | null;
  frame: number | null;
}

/**
 * The imperative part, created once: it reads the latest options from a ref
 * when an event arrives, so a re-render never interrupts a drag.
 */
function createController(latest: RefObject<Options>, setDraggingId: (id: string | null) => void) {
  let drag: DragState | null = null;

  const row = (id: string) => latest.current.list.current?.querySelector<HTMLElement>(`[data-row-id="${id}"]`) ?? null;

  /** Puts the dragged row under the pointer, wherever the layout placed it. */
  function follow() {
    const element = drag?.active ? row(drag.id) : null;
    if (!drag || !element) return;
    element.style.transform = "";
    const top = element.getBoundingClientRect().top;
    element.style.transform = `translateY(${drag.pointerY - drag.grab - top}px)`;
  }

  function reorder() {
    if (!drag?.active) return;
    const { ids, onMove } = latest.current;
    const others = ids.filter((id) => id !== drag!.id);
    const middles = others.map((id) => {
      const rect = row(id)?.getBoundingClientRect();
      return rect ? rect.top + rect.height / 2 : 0;
    });
    const target = dropIndex(middles, drag.pointerY);
    if (target !== ids.indexOf(drag.id)) onMove(drag.id, target);
    follow();
  }

  function autoScroll() {
    if (!drag?.active) return;
    const bottomInset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--savebar-h")) || 0;
    const delta = drag.pointerY < EDGE_PX ? -EDGE_SPEED_PX : drag.pointerY > window.innerHeight - EDGE_PX - bottomInset ? EDGE_SPEED_PX : 0;
    if (delta !== 0) {
      window.scrollBy(0, delta);
      reorder();
    }
    drag.frame = requestAnimationFrame(autoScroll);
  }

  function activate() {
    if (!drag || drag.active) return;
    drag.active = true;
    setDraggingId(drag.id);
    if (drag.pointerType === "touch") navigator.vibrate?.(10);
    drag.frame = requestAnimationFrame(autoScroll);
  }

  function finish(commit: boolean) {
    const state = drag;
    if (!state) return;
    drag = null;
    if (state.timer) window.clearTimeout(state.timer);
    if (state.frame) cancelAnimationFrame(state.frame);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);
    const element = row(state.id);
    if (element) element.style.transform = "";
    setDraggingId(null);
    if (commit && state.active) latest.current.onSettle(state.id, latest.current.ids.indexOf(state.id));
  }

  function onPointerDown(event: PointerEvent<HTMLElement>, id: string) {
    if (event.button !== 0 || drag) return;
    const element = row(id);
    if (!element) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag = {
      id,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startY: event.clientY,
      pointerY: event.clientY,
      grab: event.clientY - element.getBoundingClientRect().top,
      active: false,
      timer: event.pointerType === "touch" ? window.setTimeout(activate, LONG_PRESS_MS) : null,
      frame: null,
    };
    // On the window, not the handle: when React moves the row, the handle may lose its pointer capture.
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  }

  function onPointerMove(event: globalThis.PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.pointerY = event.clientY;
    const moved = Math.abs(event.clientY - drag.startY);
    if (!drag.active) {
      if (drag.pointerType === "touch") {
        if (moved > LONG_PRESS_SLOP_PX) finish(false);
        return;
      }
      if (moved < MOUSE_THRESHOLD_PX) return;
      activate();
    }
    event.preventDefault();
    reorder();
  }

  function onPointerEnd(event: globalThis.PointerEvent) {
    if (drag && event.pointerId === drag.pointerId) finish(event.type === "pointerup");
  }

  /** Keyboard alternative: arrows move one place, Home/End to the ends. */
  function onKeyDown(event: KeyboardEvent<HTMLElement>, id: string) {
    const { ids, onMove, onSettle } = latest.current;
    const index = ids.indexOf(id);
    const target =
      event.key === "ArrowUp" ? index - 1
      : event.key === "ArrowDown" ? index + 1
      : event.key === "Home" ? 0
      : event.key === "End" ? ids.length - 1
      : null;
    if (target === null) return;
    event.preventDefault();
    if (target < 0 || target >= ids.length || target === index) return;
    onMove(id, target);
    onSettle(id, target);
    // React may have moved this very row in the DOM, which drops the focus: put it back on the handle.
    requestAnimationFrame(() => row(id)?.querySelector<HTMLElement>("[data-drag-handle]")?.focus());
  }

  return { follow, cancel: () => finish(false), onPointerDown, onKeyDown };
}

type Controller = ReturnType<typeof createController>;

/**
 * Reorder rows by dragging a handle (Pointer Events; a long press on touch
 * screens) or with the arrow keys on the focused handle. The row follows the
 * pointer; the others make room as it crosses their middle.
 */
export function useDragReorder(options: Options) {
  const latest = useRef(options);
  const controller = useRef<Controller | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useLayoutEffect(() => {
    latest.current = options;
    controller.current ??= createController(latest, setDraggingId);
    // After React moves the row, keep it under the finger.
    controller.current.follow();
  }, [options]);
  useEffect(() => () => controller.current?.cancel(), []);

  const handleProps = (id: string) => ({
    "data-drag-handle": true,
    onPointerDown: (event: PointerEvent<HTMLElement>) => controller.current?.onPointerDown(event, id),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => controller.current?.onKeyDown(event, id),
    // No context menu from the long press on a phone.
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  });

  return { draggingId, handleProps };
}
