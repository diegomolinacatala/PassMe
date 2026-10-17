"use client";

import { Mark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  /** Next 16.3+: fetches the segment again and re-renders it (what "Reintentar" should do). */
  retry?: () => void;
  /** Only re-renders what's already on the client: the fallback when `retry` isn't there. */
  reset: () => void;
}

export default function ErrorBoundary({ error, retry, reset }: ErrorBoundaryProps) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="max-w-sm text-center">
        <Mark className="mx-auto size-14 -rotate-12 text-signal/40" />
        <p className="eyebrow mt-6">Algo ha fallado</p>
        <h1 className="mt-2 font-display text-5xl leading-none">Ups, se nos ha caído la tarjeta</h1>
        <p className="mt-4 text-muted">
          Ha ocurrido un error inesperado. Vuelve a intentarlo; si se repite, escríbenos
          {error.digest ? (
            <>
              {" "}
              con este código: <code className="font-mono text-ink">{error.digest}</code>
            </>
          ) : null}
          .
        </p>
        <Button onClick={() => (retry ?? reset)()} className="mt-8">
          Reintentar
        </Button>
      </div>
    </main>
  );
}
