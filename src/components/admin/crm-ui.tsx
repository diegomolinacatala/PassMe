import type { ReactNode } from "react";
import { Notice } from "@/components/ui/notice";
import { formatClock, formatNumber } from "@/lib/admin/format";
import { ADMIN_PERIODS } from "@/lib/admin/stats";
import { cn } from "@/lib/cn";
import { pillClasses } from "./pill";

/** Building blocks shared by the CRM's pages: headings, sections, tiles, filters and notices. */

/** A link in running text or a list: at least 24 px high, so stacked ones stay easy to tap. */
export const TEXT_LINK = "inline-flex min-h-6 items-center font-medium text-ink underline-offset-4 hover:text-signal-deep hover:underline";

/** A segmented row of links (period, filter): plain links, the URL holds the state. */
export function PillLinks({ label, items }: { label: string; items: Array<{ href: string; label: string; active: boolean }> }) {
  return (
    <nav aria-label={label} className="-mx-1 max-w-full overflow-x-auto px-1">
      <div className="inline-flex rounded-full bg-ink/[0.06] p-1">
        {items.map((item) => (
          <a key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className={pillClasses(item.active)}>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/** 7, 30 or 90 days, keeping the page's other parameters. */
export function PeriodFilter({ days, path, params = {} }: { days: number; path: string; params?: Record<string, string> }) {
  return (
    <PillLinks
      label="Periodo"
      items={ADMIN_PERIODS.map((period) => {
        const query = new URLSearchParams({ ...params, d: String(period) });
        return { href: `${path}?${query}`, label: `${period} días`, active: period === days };
      })}
    />
  );
}

export function PageHeading({ eyebrow, title, accent, children, aside }: { eyebrow: string; title: string; accent?: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight">
          {title}
          {accent ? (
            <>
              {" "}
              <em className="text-signal">{accent}</em>
            </>
          ) : null}
        </h1>
        {children ? <div className="mt-3 text-ink-soft">{children}</div> : null}
      </div>
      {aside}
    </div>
  );
}

export function Section({
  id,
  number,
  title,
  aside,
  children,
  className,
}: {
  id: string;
  number?: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `crm-${id}`;
  return (
    <section aria-labelledby={headingId} className={cn("min-w-0 rounded-panel border hairline bg-card p-5 sm:p-6", className)}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="flex items-baseline gap-3 font-display text-2xl tracking-tight">
          {number ? <span className="font-mono text-xs text-signal-deep">{number}</span> : null}
          {title}
        </h2>
        {aside ? <p className="text-sm text-muted">{aside}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Tile({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="bg-card px-4 py-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1.5">
        <span className="block text-3xl font-semibold tracking-tight tabular-nums">{typeof value === "number" ? formatNumber(value) : value}</span>
        {note ? <span className="mt-1 block text-sm text-ink-soft">{note}</span> : null}
      </dd>
    </div>
  );
}

export function Tiles({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-panel border hairline bg-ink/10 sm:grid-cols-3", className)}>{children}</dl>;
}

/** Small rounded label ("Publicada", "Apple Wallet · 2"). */
export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "signal" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "signal" && "bg-signal-wash text-signal-deep",
        tone === "neutral" && "bg-ink/[0.07] text-ink",
        tone === "muted" && "bg-ink/[0.04] text-muted",
      )}
    >
      {children}
    </span>
  );
}

/** Demo data, missing data and the pending migration, above a page's numbers. */
export function DataNotices({ demo, warnings, insightsPending }: { demo: boolean; warnings: string[]; insightsPending: boolean }) {
  if (!demo && warnings.length === 0 && !insightsPending) return null;
  return (
    <div className="mt-6 space-y-3">
      {demo ? <Notice tone="info" title="Modo demo">Son datos de ejemplo: sin Supabase no hay datos reales.</Notice> : null}
      {insightsPending ? (
        <Notice tone="info" title="Falta una migración">
          Aplica <code className="font-mono text-xs">20261021120000_crm_insights.sql</code> en Supabase para empezar a guardar el
          tipo de móvil y el país de cada visita, y quién trajo a cada usuario nuevo.
        </Notice>
      ) : null}
      {warnings.length > 0 ? (
        <Notice tone="error" title="Faltan datos">
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
    </div>
  );
}

export function GeneratedAt({ at, days }: { at: Date; days?: number }) {
  return (
    <>
      {days ? `Últimos ${days} días · ` : ""}datos de las {formatClock(at)}
    </>
  );
}

/** "—" for zero, so the numbers that matter stand out in a table. */
export function Count({ value }: { value: number }) {
  return <span className={cn("tabular-nums", value === 0 && "text-muted")}>{value === 0 ? "—" : formatNumber(value)}</span>;
}

/** A link to someone's public card, in a new tab. At least 24 px high: they stack under names in lists. */
export function CardLink({ slug, className }: { slug: string; className?: string }) {
  return (
    <a
      href={`/u/${encodeURIComponent(slug)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex min-h-6 items-center font-mono text-xs text-signal-deep underline-offset-2 hover:underline", className)}
    >
      /u/{slug}
    </a>
  );
}
