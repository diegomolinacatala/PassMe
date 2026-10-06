import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LinkButton } from "@/components/ui/button";

interface SiteHeaderProps {
  ctaHref: string;
  /** This browser has a session (cookie hint): one "Mi tarjeta" instead of "Entrar" + "Crear". */
  signedIn: boolean;
}

const NAV_LINK = "rounded-full px-3 py-2 text-sm text-ink-soft transition-colors hover:text-ink";

export function SiteHeader({ ctaHref, signedIn }: SiteHeaderProps) {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex min-h-20 max-w-[1240px] flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-8">
        <Logo />
        <nav aria-label="Principal" className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          <Link href="#como-funciona" className={`hidden md:inline-flex ${NAV_LINK}`}>
            Cómo funciona
          </Link>
          {/* "Privacidad" in the footer is the policy (/privacidad); this is the section about your data. */}
          <Link href="#privacidad" className={`hidden md:inline-flex ${NAV_LINK}`}>
            Tus datos
          </Link>
          <Link href="/u/demo" className={`hidden sm:inline-flex ${NAV_LINK}`}>
            Ejemplo
          </Link>
          {signedIn ? (
            <LinkButton href="/dashboard" size="sm" className="ml-1">
              Mi tarjeta
            </LinkButton>
          ) : (
            <>
              <Link href="/login" className={`inline-flex min-h-11 items-center ${NAV_LINK}`}>
                Entrar
              </Link>
              <LinkButton href={ctaHref} size="sm" className="ml-1 px-4 sm:px-3.5">
                <span className="min-[400px]:hidden">Crear</span>
                <span className="max-[399px]:hidden">Crear mi tarjeta</span>
              </LinkButton>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
