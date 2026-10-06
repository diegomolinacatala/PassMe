"use client";

import { ArrowRight, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Shared state of a public card page: which panel is open ("Déjale tu
 * contacto" or the meeting), what has been sent and whether the visitor
 * already pressed "Guardar contacto". One panel at a time; after sending,
 * the page keeps a single call to create a card (P5.7).
 */
export type CardPanel = "contact" | "meeting";

interface CardPageState {
  openPanel: CardPanel | null;
  open: (panel: CardPanel, options?: { scroll?: boolean }) => void;
  close: (panel: CardPanel) => void;
  /** The panel to scroll into view once it opens (asked for from elsewhere on the page). */
  scrollTo: CardPanel | null;
  clearScroll: () => void;
  /** The panel whose trigger gets the focus back after "Cerrar". */
  focusReturn: CardPanel | null;
  clearFocusReturn: () => void;
  sent: Readonly<Record<CardPanel, boolean>>;
  markSent: (panel: CardPanel) => void;
  saved: boolean;
  markSaved: () => void;
}

const noop = () => {};

// Outside a card page (the editor's preview) nothing opens and nothing is sent.
const CardPageContext = createContext<CardPageState>({
  openPanel: null,
  open: noop,
  close: noop,
  scrollTo: null,
  clearScroll: noop,
  focusReturn: null,
  clearFocusReturn: noop,
  sent: { contact: false, meeting: false },
  markSent: noop,
  saved: false,
  markSaved: noop,
});

export function useCardPage(): CardPageState {
  return useContext(CardPageContext);
}

export function CardPageProvider({ children }: { children: ReactNode }) {
  const [openPanel, setOpenPanel] = useState<CardPanel | null>(null);
  const [scrollTo, setScrollTo] = useState<CardPanel | null>(null);
  const [focusReturn, setFocusReturn] = useState<CardPanel | null>(null);
  const [sent, setSent] = useState<Record<CardPanel, boolean>>({ contact: false, meeting: false });
  const [saved, setSaved] = useState(false);

  const open = useCallback((panel: CardPanel, options?: { scroll?: boolean }) => {
    setOpenPanel(panel);
    setScrollTo(options?.scroll ? panel : null);
  }, []);
  const close = useCallback((panel: CardPanel) => {
    setOpenPanel((current) => (current === panel ? null : current));
    setFocusReturn(panel);
  }, []);
  const markSent = useCallback((panel: CardPanel) => {
    setSent((current) => (current[panel] ? current : { ...current, [panel]: true }));
    setOpenPanel((current) => (current === panel ? null : current));
  }, []);
  const clearScroll = useCallback(() => setScrollTo(null), []);
  const clearFocusReturn = useCallback(() => setFocusReturn(null), []);
  const markSaved = useCallback(() => setSaved(true), []);

  const value = useMemo(
    () => ({ openPanel, open, close, scrollTo, clearScroll, focusReturn, clearFocusReturn, sent, markSent, saved, markSaved }),
    [openPanel, open, close, scrollTo, clearScroll, focusReturn, clearFocusReturn, sent, markSent, saved, markSaved],
  );
  return <CardPageContext.Provider value={value}>{children}</CardPageContext.Provider>;
}

/** The dark "create yours" block goes once the visitor has sent something: that confirmation already offers it. */
export function HideAfterSending({ children }: { children: ReactNode }) {
  const { sent } = useCardPage();
  return sent.contact || sent.meeting ? null : children;
}

interface ActionPanelProps {
  panel: CardPanel;
  /** Id of the panel's container (the trigger's aria-controls). */
  id: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onOpen?: () => void;
  /** The open panel; it should include a <PanelCloseButton>. */
  children: ReactNode;
}

/**
 * A secondary action under the card: a row (icon in a soft circle, title,
 * subtitle, arrow) that opens its panel in place. Opening one closes the other.
 */
export function ActionPanel({ panel, id, icon, title, subtitle, onOpen, children }: ActionPanelProps) {
  const { openPanel, open, scrollTo, clearScroll, focusReturn, clearFocusReturn } = useCardPage();
  const isOpen = openPanel === panel;
  const trigger = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen || focusReturn !== panel) return;
    trigger.current?.focus();
    clearFocusReturn();
  }, [isOpen, focusReturn, panel, clearFocusReturn]);

  useEffect(() => {
    if (!isOpen || scrollTo !== panel) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    clearScroll();
  }, [isOpen, scrollTo, panel, clearScroll]);

  return (
    <div>
      {isOpen ? null : (
        <button
          ref={trigger}
          type="button"
          onClick={() => {
            onOpen?.();
            open(panel);
          }}
          aria-expanded={false}
          aria-controls={id}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-subtitle`}
          className="group flex w-full items-center gap-4 rounded-panel border hairline bg-card px-5 py-4 text-left shadow-soft transition-[background-color,transform] duration-300 hover:bg-white active:translate-y-px"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-signal-wash text-signal-deep transition-transform duration-500 group-hover:-rotate-6">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span id={`${id}-title`} className="block font-medium">
              {title}
            </span>
            <span id={`${id}-subtitle`} className="block text-sm text-muted">
              {subtitle}
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
        </button>
      )}
      <div ref={container} id={id} className="scroll-mt-4">
        {isOpen ? children : null}
      </div>
    </div>
  );
}

/** "Cerrar" (44×44, top right of an open panel): folds it and gives the focus back to its row. */
export function PanelCloseButton({ panel, className }: { panel: CardPanel; className?: string }) {
  const { close } = useCardPage();
  return (
    <button
      type="button"
      onClick={() => close(panel)}
      aria-label="Cerrar"
      title="Cerrar"
      className={
        className ??
        "grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
      }
    >
      <X className="size-5" aria-hidden />
    </button>
  );
}
