import Link from "next/link";
import { Mark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";

export default function CardNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="max-w-sm text-center">
        <Mark className="mx-auto size-14 -rotate-6 text-ink/25" />
        <p className="eyebrow mt-6">Error 404</p>
        <h1 className="mt-2 font-display text-5xl leading-none">Esta tarjeta no existe</h1>
        <p className="mt-4 text-muted">
          Puede que el enlace esté mal escrito o que su dueño la haya retirado. Pídele que te la enseñe de nuevo.
        </p>
        <Link href="/crear" className={buttonClasses({ variant: "ink", className: "mt-8" })}>
          Crear mi propia tarjeta
        </Link>
      </div>
    </main>
  );
}
