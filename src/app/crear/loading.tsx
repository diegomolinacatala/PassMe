import { Logo } from "@/components/brand/logo";

/**
 * Shown the instant "Crear mi tarjeta" is tapped, while the server prepares
 * /crear (the form needs the visitor's session and, when they came from a card,
 * that card). Without it the tap seems to do nothing for a second on a slow
 * phone: this is the page's own header and heading, so nothing jumps when the
 * real one replaces it. Next also prefetches down to this boundary from the links.
 */
export default function Loading() {
  return (
    <main className="min-h-dvh" aria-busy="true">
      <header className="mx-auto flex h-20 max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <Logo />
      </header>
      <div className="pt-4 sm:pt-10">
        <div className="mx-auto max-w-[1120px] px-5 pb-20 sm:px-8">
          <h1 className="font-display text-[length:var(--text-title)] leading-[0.95] tracking-tight sm:text-6xl">
            Tu tarjeta, <em className="text-signal">en un minuto.</em>
          </h1>
          <p className="mt-4 max-w-md text-ink-soft" role="status">
            Preparando tu tarjeta…
          </p>
        </div>
      </div>
    </main>
  );
}
