"use client";

import { ChevronUp, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { initials } from "@/lib/card/name";
import { resolveDesign } from "@/lib/card/design";
import type { PublicCard } from "@/lib/card/types";
import { PreviewPanel } from "./preview-panel";
import { useBottomInsetVar } from "./save-bar";

/** Below this width the preview isn't in a sticky column, so it scrolls away. */
const NARROW_QUERY = "(max-width: 1023.98px)";

/** True while the element is off screen on a narrow layout. */
function useOffScreen(target: RefObject<HTMLElement | null>): boolean {
  const [offScreen, setOffScreen] = useState(false);
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const narrow = window.matchMedia(NARROW_QUERY);
    let intersecting = true;
    const update = () => setOffScreen(narrow.matches && !intersecting);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry?.isIntersecting ?? true;
      update();
    });
    observer.observe(element);
    narrow.addEventListener("change", update);
    return () => {
      observer.disconnect();
      narrow.removeEventListener("change", update);
    };
  }, [target]);
  return offScreen;
}

/** The pass in miniature: its colors and the photo or initials. */
function PassThumbnail({ card }: { card: PublicCard }) {
  const design = resolveDesign(card);
  return (
    <span
      className="relative flex h-11 w-16 shrink-0 items-center justify-end overflow-hidden rounded-lg pr-1.5 shadow-hairline"
      style={{ backgroundColor: design.background }}
      aria-hidden="true"
    >
      <span className="absolute bottom-2 left-1.5 h-1 w-5 rounded-full opacity-80" style={{ backgroundColor: design.foreground }} />
      {card.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a 28 px thumbnail of the owner's own upload
        <img src={card.avatarUrl} alt="" width={28} height={28} className="size-7 rounded-full object-cover" style={{ outline: `1px solid ${design.detail}` }} />
      ) : (
        <span
          className="grid size-7 place-items-center rounded-full font-display text-xs leading-none"
          style={{ border: `1px solid ${design.detail}`, color: design.foreground }}
        >
          {initials(card.fullName)}
        </span>
      )}
    </span>
  );
}

interface PreviewDockProps {
  card: PublicCard;
  /** The inline preview: when it's scrolled away, the pill shows up. */
  anchor: RefObject<HTMLElement | null>;
}

/**
 * Phones and tablets: once the preview scrolls out of view, a 64 px pill with
 * the pass in miniature sits above the save bar. Tapping it opens a bottom
 * sheet (a modal <dialog>: focus stays inside, Escape closes it, the focus goes
 * back to the pill) with the full preview, without losing the scroll position.
 */
export function PreviewDock({ card, anchor }: PreviewDockProps) {
  const offScreen = useOffScreen(anchor);
  const [open, setOpen] = useState(false);
  const [pill, setPill] = useState<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Not inert while the sheet is open: closing it gives the focus back to the pill.
  const shown = offScreen;
  useBottomInsetVar("--pill-h", pill, shown);

  function show() {
    setOpen(true);
    dialog.current?.showModal();
  }

  return (
    <>
      <button
        ref={setPill}
        type="button"
        onClick={show}
        inert={!shown}
        aria-hidden={!shown}
        className={
          "fixed right-3 z-20 flex h-16 items-center gap-3 rounded-full border hairline bg-card/95 py-2.5 pr-4 pl-2.5 text-body font-medium text-ink shadow-object backdrop-blur-md transition-[transform,opacity] duration-200 ease-[var(--ease-out-expo)] lg:hidden " +
          (shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0")
        }
        style={{ bottom: "calc(var(--savebar-h, max(0.75rem, env(safe-area-inset-bottom))) + 0.5rem)" }}
      >
        <PassThumbnail card={card} />
        Ver el pase
        <ChevronUp className="size-4 text-muted" aria-hidden />
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          pill?.focus();
        }}
        // Tapping the backdrop closes it, like a sheet.
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        className="mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-[640px] overflow-y-auto rounded-t-object bg-paper p-0 text-ink shadow-object backdrop:bg-ink/55 backdrop:backdrop-blur-[2px] lg:hidden"
      >
        <div className="px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id={titleId} className="eyebrow">
              Vista previa
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Cerrar"
              className="-mr-2 grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {open ? <PreviewPanel card={card} /> : null}
        </div>
      </dialog>
    </>
  );
}
