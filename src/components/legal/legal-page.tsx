import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { LEGAL_UPDATED, legalSectionId } from "@/lib/legal";

export interface LegalSection {
  /** Anchor, e.g. "contactos" → /privacidad#contactos. Defaults to a slug of the title. */
  id?: string;
  title: string;
  body: ReactNode[];
}

interface LegalPageProps {
  title: string;
  intro: ReactNode;
  /** «En 30 segundos»: a handful of plain bullets right after the intro. */
  summary?: string[];
  sections: LegalSection[];
}

const LEGAL_LINKS = [
  { href: "/aviso-legal", label: "Aviso legal" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/terminos", label: "Términos" },
];

/** Shared layout for the legal pages: summary, index and numbered sections in the editorial style. */
export function LegalPage({ title, intro, summary, sections }: LegalPageProps) {
  const anchored = sections.map((section) => ({ ...section, id: section.id ?? legalSectionId(section.title) }));
  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:py-12">
      <Logo />
      <p className="eyebrow mt-14">Última actualización: {LEGAL_UPDATED}</p>
      <h1 className="mt-3 font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight">{title}</h1>
      <div className="mt-6 text-lg leading-relaxed text-ink-soft">{intro}</div>

      {summary?.length ? (
        <section aria-labelledby="legal-summary" className="mt-10 rounded-panel bg-paper-deep p-5 sm:p-6">
          <h2 id="legal-summary" className="eyebrow text-signal-deep">
            En 30 segundos
          </h2>
          <ul className="mt-3 space-y-2 leading-relaxed text-ink">
            {summary.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-signal" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-labelledby="legal-index" className="mt-10 border-y hairline py-5">
        <h2 id="legal-index" className="eyebrow">
          En esta página
        </h2>
        <ol className="mt-3 grid gap-x-6 sm:grid-cols-2">
          {anchored.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="flex min-h-11 items-center gap-3 rounded-lg py-1 text-ink-soft underline-offset-4 hover:text-ink hover:underline"
              >
                <span className="font-mono text-mark text-signal-deep" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-12 space-y-12">
        {anchored.map((section, index) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-8">
            <p className="eyebrow text-signal-deep">{String(index + 1).padStart(2, "0")}</p>
            <h2 id={`${section.id}-title`} className="mt-1 font-display text-3xl leading-none">
              {section.title}
            </h2>
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
