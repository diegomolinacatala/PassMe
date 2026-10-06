"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { SectionLayout } from "./sections";

export interface IndexEntry extends SectionLayout {
  /** Things waiting (meetings to answer, new contacts). */
  badge?: number;
}

const ITEM =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-body text-ink transition-colors hover:bg-ink/[0.05] focus-visible:bg-ink/[0.05] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal";

/** Both numbers, each on its own breakpoint (the order differs on phones). */
function SectionNo({ entry }: { entry: SectionLayout }) {
  return (
    <span className="eyebrow w-6 shrink-0 text-signal-deep">
      <span className="lg:hidden">{entry.mobileNumber}</span>
      <span className="max-lg:hidden">{entry.number}</span>
    </span>
  );
}

/** Keeps anchors and focused fields clear of the sticky bar (WCAG 2.4.11). */
function useTopScrollPadding(bar: HTMLElement | null) {
  useEffect(() => {
    if (!bar) return;
    const html = document.documentElement;
    const apply = () => {
      html.style.scrollPaddingTop = `${bar.offsetHeight + 12}px`;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      html.style.scrollPaddingTop = "";
    };
  }, [bar]);
}

/** The section in view: the last one whose top went past the upper third of the screen. */
function useCurrentSection(entries: ReadonlyArray<IndexEntry>): string {
  const [current, setCurrent] = useState(entries[0]!.id);
  useEffect(() => {
    const update = () => {
      const line = window.innerHeight / 3;
      let best: { id: string; top: number } | null = null;
      for (const entry of entries) {
        const element = document.getElementById(entry.id);
        if (!element || element.getClientRects().length === 0) continue;
        const { top, bottom } = element.getBoundingClientRect();
        if (top <= line && bottom > 0 && (!best || top > best.top)) best = { id: entry.id, top };
      }
      setCurrent(best?.id ?? entries[0]!.id);
    };
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [entries]);
  return current;
}

/**
 * The editor's index: a sticky bar that says where you are («03 Estilo ▾») and
 * opens the list of sections to jump to. A disclosure of plain links, so it
 * works with the keyboard and screen readers as they expect.
 */
export function EditorIndex({ entries }: { entries: ReadonlyArray<IndexEntry> }) {
  const [open, setOpen] = useState(false);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const currentId = useCurrentSection(entries);
  const current = entries.find((entry) => entry.id === currentId) ?? entries[0]!;
  const waiting = entries.reduce((sum, entry) => sum + (entry.badge ?? 0), 0);
  useTopScrollPadding(bar);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (bar && !bar.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [bar, open]);

  function jump(id: string) {
    setOpen(false);
    const target = document.getElementById(id);
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    target.focus({ preventScroll: true });
  }

  return (
    <div ref={setBar} className="sticky top-0 z-20 -mx-4 mb-6 bg-paper/90 px-4 py-2 backdrop-blur-md sm:-mx-8 sm:px-8">
      <div className="relative">
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-full border border-field-border bg-card py-1.5 pr-3 pl-4 text-body font-medium text-ink shadow-soft transition-colors hover:border-ink"
        >
          <span className="sr-only">Secciones del editor. Estás en:</span>
          <SectionNo entry={current} />
          <span className="truncate">{current.title}</span>
          {waiting > 0 ? (
            <span className="grid min-w-5 place-items-center rounded-full bg-ink px-1.5 font-mono text-mark text-paper">
              {waiting}
              <span className="sr-only"> pendientes</span>
            </span>
          ) : null}
          <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>
        <nav
          id={listId}
          aria-label="Secciones del editor"
          hidden={!open}
          className="absolute top-full left-0 z-30 mt-2 max-h-[70dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border hairline bg-card p-1.5 shadow-object"
        >
          <ul className="flex flex-col">
            {entries.map((entry) => (
              <li key={entry.id} className={entry.orderClass}>
                <a
                  href={`#${entry.id}`}
                  aria-current={entry.id === current.id ? "location" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    jump(entry.id);
                  }}
                  className={cn(ITEM, entry.id === current.id && "bg-paper-deep")}
                >
                  <SectionNo entry={entry} />
                  <span className="min-w-0 flex-1">{entry.title}</span>
                  {entry.badge ? (
                    <span className="rounded-full bg-signal-wash px-2 py-0.5 text-sm font-medium text-signal-deep">
                      {entry.badge} <span className="sr-only">pendientes</span>
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
