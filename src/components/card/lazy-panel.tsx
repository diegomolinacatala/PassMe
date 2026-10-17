"use client";

import { Component, createElement, lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

/**
 * A panel body loaded when the visitor asks for it (or a moment after the page
 * settles), not with the card: most people who scan a card never open the
 * contact form or the meeting picker, and every KB on an event's Wi-Fi counts.
 *
 * Built on React.lazy rather than next/dynamic: next/dynamic's `loading` gets no
 * error and no retry, so a chunk that fails to arrive (a train tunnel, a deploy
 * in between) would land on the error page. Here it becomes a short message and
 * a "Reintentar" button.
 */

interface LazyPanel<P extends object> {
  /** The body, to render where it would have gone. */
  Panel: ComponentType<P>;
  /** Starts the download without rendering anything (hover, focus, first touch, idle). */
  preload: () => void;
}

export function lazyPanel<P extends object>(load: () => Promise<ComponentType<P>>, { boxed = false }: { boxed?: boolean } = {}): LazyPanel<P> {
  const asModule = () => load().then((component) => ({ default: component }));
  // Replaced on retry: React.lazy remembers a failed load for good.
  let Current = lazy(asModule);

  function Panel(props: P) {
    const [attempt, setAttempt] = useState(0);
    const retry = () => {
      Current = lazy(asModule);
      setAttempt((n) => n + 1);
    };
    return (
      <LoadFailed key={attempt} onRetry={retry}>
        <Suspense fallback={<Loading boxed={boxed} />}>{createElement(Current as ComponentType<P>, props)}</Suspense>
      </LoadFailed>
    );
  }

  return { Panel, preload: () => void load().catch(() => undefined) };
}

/** `boxed`: the panel is a card of its own; otherwise it fills a card that is already there. */
function Loading({ boxed }: { boxed: boolean }) {
  return (
    <div role="status" className={boxed ? "rounded-panel border hairline bg-card px-5 py-8 text-center text-sm text-muted" : "py-8 text-center text-sm text-muted"}>
      Cargando…
    </div>
  );
}

interface LoadFailedProps {
  children: ReactNode;
  onRetry: () => void;
}

/** What browsers and the bundler say when a script or chunk does not arrive. */
const CHUNK_FAILURE = /chunk|dynamically imported module|importing a module script|failed to fetch|networkerror|load failed/i;

class LoadFailed extends Component<LoadFailedProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Only a download that failed is ours to handle; a bug in the panel keeps going to the error page.
    if (!CHUNK_FAILURE.test(`${error.name} ${error.message}`)) throw error;
    return (
      <Notice
        tone="error"
        action={
          <button type="button" onClick={this.props.onRetry} className={buttonClasses({ variant: "outline", size: "sm", className: "shrink-0" })}>
            Reintentar
          </button>
        }
      >
        No hemos podido cargar el formulario. Comprueba tu conexión.
      </Notice>
    );
  }
}

/**
 * Calls `preload` once the page has settled, unless this connection is slow or
 * the visitor asked to save data (then it waits for a pointer, focus or touch).
 */
export function preloadWhenIdle(preload: () => void, delayMs = 3000): () => void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return () => undefined;
  const timer = window.setTimeout(preload, delayMs);
  return () => window.clearTimeout(timer);
}
