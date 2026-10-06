"use client";

import { Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** How long "Deshacer" stays on screen (paused while it has the pointer or the focus). */
export const UNDO_MS = 6000;

let removals = 0;

/** A fresh key for each removal (two removals of the same thing restart the countdown). */
export function undoKey(id: string): string {
  removals += 1;
  return `${id}-${removals}`;
}

export interface UndoItem {
  /** Changes for every removal, so a second one restarts the countdown. */
  key: string;
  /** "Teléfono quitado". */
  message: string;
}

interface UndoNoticeProps {
  item: UndoItem | null;
  onUndo: () => void;
  /** The time is up: make the removal final. */
  onExpire: () => void;
  className?: string;
}

/**
 * Removing something of your own that can be recovered: no confirmation, but a
 * "Teléfono quitado · Deshacer" for a few seconds. The live region is always
 * there, so screen readers announce each removal.
 */
export function UndoNotice({ item, onUndo, onExpire, className }: UndoNoticeProps) {
  const [paused, setPaused] = useState(false);
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!item || paused) return;
    const timer = window.setTimeout(() => expire.current(), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [item, paused]);

  return (
    <div role="status" aria-live="polite" className={cn(item ? "mt-3" : "sr-only", className)}>
      {item ? (
        <div
          className="inline-flex max-w-full flex-wrap items-center gap-x-1 rounded-full bg-ink py-1 pr-1 pl-4 text-sm text-paper shadow-soft animate-rise"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <span>{item.message}</span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-medium text-glow underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-glow"
          >
            <Undo2 className="size-4" aria-hidden />
            Deshacer
          </button>
        </div>
      ) : null}
    </div>
  );
}
