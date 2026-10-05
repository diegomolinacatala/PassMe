import Link from "next/link";
import { Mark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";

/** A card that doesn't exist, or whose owner unpublished it: same answer, two ways out. */
export default function CardNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="max-w-sm text-center">
        <Mark className="mx-auto size-14 -rotate-6 text-ink/25" />
        <h1 className="mt-6 font-display text-5xl leading-none">Esta tarjeta no está disponible</h1>
        <p className="mt-4 text-muted">
          Puede que el enlace esté mal escrito o que su dueño la haya retirado. Pídele que te la enseñe de nuevo.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link href="/" className={buttonClasses({ variant: "ink" })}>
            Ir a PassMe
          </Link>
          <Link href="/crear" className="inline-flex min-h-11 items-center text-sm font-medium text-signal-deep underline-offset-4 hover:underline">
            Crear mi tarjeta
          </Link>
        </div>
      </div>
    </main>
  );
}
