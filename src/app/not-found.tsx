import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="max-w-sm text-center">
        <Mark className="mx-auto size-14 rotate-6 text-ink/25" />
        <h1 className="mt-6 font-display text-5xl leading-none">Aquí no hay nada</h1>
        <p className="mt-4 text-muted">La página que buscas no existe o se ha movido.</p>
        <Link href="/" className={buttonClasses({ variant: "ink", className: "mt-8" })}>
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
