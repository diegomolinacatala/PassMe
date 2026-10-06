"use client";

import { ZoomIn } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { clampView, displayScale, MAX_ZOOM, MIN_ZOOM, zoomView, type CropView } from "@/lib/card/crop";

/** Side of the framing square on screen, in px. */
const VIEWPORT_PX = 272;
/** Arrow keys move the photo this much; +/- change the zoom by this step. */
const KEY_STEP_PX = 12;
const KEY_ZOOM_STEP = 0.1;

export interface CropSource {
  /** Object URL of the picked file, for the <img>. */
  url: string;
  width: number;
  height: number;
}

interface PhotoCropSheetProps {
  source: CropSource | null;
  onCancel: () => void;
  onConfirm: (view: CropView) => void;
}

/**
 * «Encuadra tu foto»: drag to move, pinch (or the slider) to zoom, inside a
 * circular mask. A modal <dialog>: Escape or «Cancelar» close it.
 */
function initialView(source: CropSource): CropView {
  return { width: source.width, height: source.height, viewport: VIEWPORT_PX, zoom: MIN_ZOOM, x: 0, y: 0 };
}

export function PhotoCropSheet({ source, onCancel, onConfirm }: PhotoCropSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const confirmed = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const titleId = useId();
  const hintId = useId();
  // The framing belongs to the photo it was made for; a new photo starts centered.
  const [framing, setFraming] = useState<{ source: CropSource; view: CropView } | null>(null);
  const view = source ? (framing?.source === source ? framing.view : initialView(source)) : null;
  const setView = (next: CropView) => {
    if (source) setFraming({ source, view: next });
  };

  useEffect(() => {
    if (!source) return;
    confirmed.current = false;
    if (!dialog.current?.open) dialog.current?.showModal();
  }, [source]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !view) return;
    const others = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId).map(([, point]) => point);
    const next = { x: event.clientX, y: event.clientY };
    if (others.length === 0) {
      setView(clampView({ ...view, x: view.x + next.x - previous.x, y: view.y + next.y - previous.y }));
    } else {
      // Pinch: the zoom follows the change in distance between the two fingers.
      const other = others[0]!;
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 0) setView(zoomView(view, view.zoom * (after / before)));
    }
    pointers.current.set(event.pointerId, next);
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!view) return;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP_PX, 0],
      ArrowRight: [KEY_STEP_PX, 0],
      ArrowUp: [0, -KEY_STEP_PX],
      ArrowDown: [0, KEY_STEP_PX],
    };
    if (move[event.key]) {
      const [dx, dy] = move[event.key]!;
      setView(clampView({ ...view, x: view.x + dx, y: view.y + dy }));
    } else if (event.key === "+" || event.key === "=") {
      setView(zoomView(view, view.zoom + KEY_ZOOM_STEP));
    } else if (event.key === "-") {
      setView(zoomView(view, view.zoom - KEY_ZOOM_STEP));
    } else {
      return;
    }
    event.preventDefault();
  }

  const scale = view ? displayScale(view) : 1;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={() => {
        pointers.current.clear();
        if (!confirmed.current) onCancel();
      }}
      className="m-auto w-[min(92vw,24rem)] rounded-object bg-card p-0 text-ink shadow-object backdrop:bg-ink/55 backdrop:backdrop-blur-[2px] max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
    >
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <p className="eyebrow">Tu foto</p>
        <h2 id={titleId} className="mt-1 font-display text-3xl leading-none tracking-tight">
          Encuadra <em className="text-signal">tu foto.</em>
        </h2>
        <p id={hintId} className="mt-2 text-sm text-muted">
          Arrástrala para moverla y pellizca para acercarla. Con el teclado: flechas y + o −.
        </p>
        {source && view ? (
          <div
            role="group"
            aria-label="Encuadre de la foto"
            aria-describedby={hintId}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onKeyDown={onKeyDown}
            className="relative mx-auto mt-4 cursor-grab touch-none overflow-hidden rounded-2xl bg-ink select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal active:cursor-grabbing"
            style={{ width: VIEWPORT_PX, height: VIEWPORT_PX }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL being framed, not a page image */}
            <img
              src={source.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
              style={{
                width: view.width * scale,
                height: view.height * scale,
                transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px)`,
              }}
            />
            {/* What stays is what's inside the circle. */}
            <span
              className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-paper/90"
              style={{ boxShadow: "0 0 0 999px rgb(43 29 21 / 0.6)" }}
              aria-hidden="true"
            />
          </div>
        ) : null}
        {view ? (
          <label className="mt-4 flex items-center gap-3 text-sm font-medium text-ink-soft">
            <ZoomIn className="size-4 shrink-0" aria-hidden />
            <span className="shrink-0">Zoom</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={view.zoom}
              onChange={(event) => setView(zoomView(view, Number(event.target.value)))}
              className="h-11 min-w-0 flex-1 accent-ink"
            />
          </label>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Button variant="outline" onClick={() => dialog.current?.close()}>
            Cancelar
          </Button>
          <Button
            variant="ink"
            disabled={!view}
            onClick={() => {
              if (!view) return;
              confirmed.current = true;
              dialog.current?.close();
              onConfirm(view);
            }}
          >
            Usar foto
          </Button>
        </div>
      </div>
    </dialog>
  );
}
