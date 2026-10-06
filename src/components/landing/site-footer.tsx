import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/** `googleWallet`: Google Wallet is live (GOOGLE_WALLET_LIVE); until then it isn't promised. */
export function SiteFooter({ googleWallet }: { googleWallet: boolean }) {
  return (
    <footer className="border-t hairline">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-12 sm:flex-row sm:items-end sm:justify-between sm:px-8">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">
            {googleWallet
              ? "Tarjetas de contacto para Apple Wallet y Google Wallet."
              : "Tarjetas de contacto para Apple Wallet y cualquier móvil con cámara."}
          </p>
        </div>
        <nav aria-label="Pie de página" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
          <Link href="/u/demo" className="hover:text-ink">
            Ejemplo
          </Link>
          <Link href="/login" className="hover:text-ink">
            Entrar
          </Link>
          <Link href="/privacidad" className="hover:text-ink">
            Privacidad
          </Link>
          <Link href="/terminos" className="hover:text-ink">
            Términos
          </Link>
          <Link href="/aviso-legal" className="hover:text-ink">
            Aviso legal
          </Link>
        </nav>
        <p className="eyebrow">© {new Date().getFullYear()} PassMe</p>
      </div>
    </footer>
  );
}
