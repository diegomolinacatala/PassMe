import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LinkButton } from "@/components/ui/button";

export function SiteHeader({ ctaHref }: { ctaHref: string }) {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex h-20 max-w-[1240px] items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="#como-funciona"
            className="hidden rounded-full px-3 py-2 text-sm text-ink-soft transition-colors hover:text-ink md:inline-flex"
          >
            Cómo funciona
          </Link>
          <Link
            href="#privacidad"
            className="hidden rounded-full px-3 py-2 text-sm text-ink-soft transition-colors hover:text-ink md:inline-flex"
          >
            Privacidad
          </Link>
          <Link
            href="/u/demo"
            className="hidden rounded-full px-3 py-2 text-sm text-ink-soft transition-colors hover:text-ink sm:inline-flex"
          >
            Ejemplo
          </Link>
          <Link
            href="/login"
            className="hidden rounded-full px-3 py-2 text-sm text-ink-soft transition-colors hover:text-ink min-[400px]:inline-flex"
          >
            Entrar
          </Link>
          <LinkButton href={ctaHref} size="sm" className="ml-1">
            Crear mi tarjeta
          </LinkButton>
        </nav>
      </div>
    </header>
  );
}
