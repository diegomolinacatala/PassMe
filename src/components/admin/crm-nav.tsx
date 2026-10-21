"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pillClasses } from "./pill";

const LINKS = [
  { href: "/crm", label: "Resumen" },
  { href: "/crm/usuarios", label: "Usuarios" },
  { href: "/crm/wallet", label: "Wallet" },
  { href: "/crm/contactos", label: "Mis contactos" },
  { href: "/crm/actividad", label: "Actividad" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === "/crm" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** The CRM's sections. Scrolls sideways on a phone instead of wrapping. */
export function CrmNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del CRM" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="inline-flex rounded-full bg-ink/[0.06] p-1">
        {LINKS.map((link) => {
          const current = isCurrent(pathname, link.href);
          return (
            <li key={link.href}>
              <Link href={link.href} aria-current={current ? "page" : undefined} className={pillClasses(current)}>
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
