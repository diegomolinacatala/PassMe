"use client";

import { Mark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
        <Button onClick={reset} className="mt-8">
          Reintentar
        </Button>
      </div>
    </main>
  );
}
