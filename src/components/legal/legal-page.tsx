import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { LEGAL_UPDATED } from "@/lib/legal";

export interface LegalSection {
  /** Anchor, e.g. "contactos" → /privacidad#contactos. */
  id?: string;
  title: string;
  body: ReactNode[];
}

interface LegalPageProps {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
}

const LEGAL_LINKS = [
  { href: "/aviso-legal", label: "Aviso legal" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/terminos", label: "Términos" },
];

/** Shared layout for the legal pages: numbered sections in the editorial style. */
export function LegalPage({ title, intro, sections }: LegalPageProps) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:py-12">
      <Logo />
      <p className="eyebrow mt-14">Última actualización: {LEGAL_UPDATED}</p>
      <h1 className="mt-3 font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight">{title}</h1>
      <div className="mt-6 text-lg leading-relaxed text-ink-soft">{intro}</div>
      <div className="mt-12 space-y-12">
        {sections.map((section, index) => (
          <section key={section.title} id={section.id} className="scroll-mt-8">
            <p className="font-mono text-[11px] tracking-[0.16em] text-signal-deep">{String(index + 1).padStart(2, "0")}</p>
            <h2 className="mt-1 font-display text-3xl leading-none">{section.title}</h2>
            <ul className="mt-4 space-y-3 leading-relaxed text-ink-soft">
              {section.body.map((paragraph, i) => (
                <li key={i} className="border-l-2 border-line pl-4">
                  {paragraph}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <nav aria-label="Textos legales" className="mt-16 flex flex-wrap gap-x-6 gap-y-2 border-t hairline pt-6 text-sm text-muted">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-ink">
            {link.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
