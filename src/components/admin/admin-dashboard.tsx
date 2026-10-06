import type { ReactNode } from "react";
import { adminLogoutAction } from "@/app/admin/actions";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatClock, formatLongDay, formatNumber, formatPercent, formatShortDay } from "@/lib/admin/format";
import { ADMIN_PERIODS, type AdminStats } from "@/lib/admin/stats";
import { PATTERN_LABELS } from "@/lib/card/pattern";
import { cn } from "@/lib/cn";
import { BarList } from "./bar-list";
import { ColumnChart } from "./column-chart";
import { UsersTable } from "./users-table";

interface AdminDashboardProps {
  stats: AdminStats;
  generatedAt: Date;
}

function PeriodFilter({ days }: { days: number }) {
  return (
    <nav aria-label="Periodo" className="inline-flex rounded-full bg-ink/[0.06] p-1">
      {ADMIN_PERIODS.map((period) => (
        <a
          key={period}
          href={`/admin?d=${period}`}
          aria-current={period === days ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-medium transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
            period === days ? "bg-card text-ink shadow-soft" : "text-ink-soft hover:text-ink",
          )}
        >
          {period} días
        </a>
      ))}
    </nav>
  );
}

function Tile({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="bg-card px-4 py-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1.5">
        <span className="block text-3xl font-semibold tracking-tight tabular-nums">{formatNumber(value)}</span>
        <span className="mt-1 block text-sm text-ink-soft">{note}</span>
      </dd>
    </div>
  );
}

function Section({ number, title, aside, children, className }: { number: string; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  const id = `admin-${number}`;
  return (
    <section aria-labelledby={id} className={cn("rounded-panel border hairline bg-card p-5 sm:p-6", className)}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="flex items-baseline gap-3 font-display text-2xl tracking-tight">
          <span className="font-mono text-xs text-signal-deep">{number}</span>
          {title}
        </h2>
        {aside ? <p className="text-sm text-muted">{aside}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminDashboard({ stats, generatedAt }: AdminDashboardProps) {
  const { totals, period, days } = stats;
  const daily = stats.daily.map((d) => ({
    key: d.day,
    label: formatLongDay(d.day),
    axisLabel: formatShortDay(d.day),
    value: d.views,
    detail: d.views > 0 ? `QR ${d.qr} · enlace ${d.share} · directo ${d.views - d.qr - d.share}` : undefined,
  }));
  const weekly = stats.weekly.map((w) => ({
    key: w.week,
    label: `Semana del ${formatShortDay(w.week)}`,
    axisLabel: formatShortDay(w.week),
    value: w.signups,
    detail: `${formatNumber(w.total)} en total`,
  }));
  const ofViews = (n: number) => formatPercent(n, period.views);

  return (
    <div className="min-h-dvh">
      <header className="border-b hairline">
        <div className="mx-auto flex min-h-16 max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo href="/admin" />
            <span className="eyebrow hidden sm:inline">Panel privado</span>
          </div>
          <form action={adminLogoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 pt-8 pb-16 sm:px-8 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div>
            <p className="eyebrow">Estadísticas</p>
            <h1 className="mt-2 font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight">
              Cómo va <em className="text-signal">PassMe.</em>
            </h1>
            <p className="mt-3 text-ink-soft">
              Últimos {days} días · datos de las {formatClock(generatedAt)}
            </p>
          </div>
          <PeriodFilter days={days} />
        </div>

        {stats.demo || stats.warnings.length > 0 ? (
          <div className="mt-6 space-y-3">
            {stats.demo ? <Notice tone="info" title="Modo demo">Son datos de ejemplo: sin Supabase no hay datos reales.</Notice> : null}
            {stats.warnings.length > 0 ? (
              <Notice tone="error" title="Faltan datos">
                <ul>
                  {stats.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section aria-labelledby="admin-wallet" className="relative overflow-hidden rounded-panel bg-ink p-6 text-paper sm:p-7">
            <h2 id="admin-wallet" className="eyebrow text-glow">
              En la cartera ahora
            </h2>
            <p className="mt-4 text-[4rem] leading-none font-semibold tracking-tight tabular-nums">{formatNumber(totals.appleCards)}</p>
            <p className="mt-2 text-lg">
              {totals.appleCards === 1 ? "tarjeta" : "tarjetas"} en Apple Wallet
            </p>
            <p className="mt-1 text-sm text-paper/75">
              En {formatNumber(totals.appleDevices)} dispositivos (el iPhone y el Apple Watch cuentan aparte) ·{" "}
              {formatPercent(totals.appleCards, totals.publishedCards)} de las tarjetas publicadas
            </p>
            <div className="mt-6 border-t border-paper/15 pt-4 text-sm text-paper/75">
              <p>
                Pulsaron «Añadir a Apple Wallet» {formatNumber(period.applePassTaps)} veces y «Añadir a Google Wallet»{" "}
                {formatNumber(period.googlePassTaps)} en {days} días.
              </p>
              <p className="mt-2">Google no avisa cuando alguien guarda o borra un pase: no se puede saber cuántos lo tienen.</p>
            </div>
          </section>

          <dl className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-panel border hairline bg-ink/10 sm:grid-cols-3">
            <Tile label="Usuarios" value={totals.users} note={`+${formatNumber(period.newUsers)} en ${days} días`} />
            <Tile label="Han entrado" value={period.activeUsers} note={`en ${days} días`} />
            <Tile label="Tarjetas publicadas" value={totals.publishedCards} note={`de ${formatNumber(totals.cards)} creadas`} />
            <Tile label="Visitas" value={period.views} note={`a ${formatNumber(period.viewedCards)} tarjetas`} />
            <Tile label="Escaneos del QR" value={period.qrViews} note={`${ofViews(period.qrViews)} de las visitas`} />
            <Tile label="Guardaron el contacto" value={period.vcards} note={`${ofViews(period.vcards)} de las visitas`} />
          </dl>
        </div>

        {/* minmax(0, 1fr): the wide users table scrolls inside its box instead of widening the page. */}
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
          <Section number="01" title="Visitas por día" aside={`${formatNumber(period.views)} en ${days} días`}>
            <ColumnChart data={daily} title="Visitas por día" unit="visitas" />
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section number="02" title="Al ver una tarjeta" aside="Sobre las visitas">
              <BarList
                max={period.views}
                rows={[
                  { label: "Visitas", value: period.views },
                  { label: "Guardaron el contacto", value: period.vcards, note: ofViews(period.vcards) },
                  { label: "Pulsaron un enlace", value: period.linkClicks, note: ofViews(period.linkClicks) },
                  { label: "Dejaron su contacto", value: period.contactRequests, note: ofViews(period.contactRequests) },
                  { label: "Propusieron una reunión", value: period.meetings, note: ofViews(period.meetings) },
                ]}
              />
              <p className="mt-5 text-sm text-muted">
                En total: {formatNumber(totals.contactRequests)} contactos recibidos y {formatNumber(totals.meetings)} reuniones
                propuestas ({formatNumber(totals.meetingsConfirmed)} confirmadas).
              </p>
            </Section>

            <Section number="03" title="De dónde llegan" aside={`${days} días`}>
              <BarList
                rows={[
                  { label: "Escaneando el QR", value: period.qrViews, note: ofViews(period.qrViews) },
                  { label: "Con un enlace compartido", value: period.shareViews, note: ofViews(period.shareViews) },
                  { label: "Directo (enlace sin marcar)", value: period.directViews, note: ofViews(period.directViews) },
                ]}
              />
              <p className="mt-5 text-sm text-muted">El QR del pase y el de «Mi QR» llevan la marca de escaneo.</p>
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Section number="04" title="Altas por semana" aside={`${formatNumber(totals.users)} usuarios en total`}>
              <ColumnChart data={weekly} title="Altas por semana" unit="altas" tone="ink" />
            </Section>

            <Section number="05" title="Motivos elegidos" aside={`${formatNumber(totals.cards)} tarjetas`}>
              <BarList
                max={totals.cards}
                rows={stats.patterns.map((p) => ({
                  label: PATTERN_LABELS[p.pattern].name,
                  value: p.count,
                  note: formatPercent(p.count, totals.cards),
                }))}
                empty="Aún no hay tarjetas."
              />
            </Section>
          </div>

          <section aria-labelledby="admin-users" className="mt-4">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="admin-users" className="flex items-baseline gap-3 font-display text-3xl tracking-tight">
                <span className="font-mono text-xs text-signal-deep">06</span>
                Usuarios
              </h2>
              <p className="text-sm text-muted">Visitas, guardados, contactos y reuniones: últimos {days} días</p>
            </div>
            <UsersTable users={stats.users} days={days} />
          </section>
        </div>

        <p className="mt-10 max-w-2xl text-sm text-muted">
          Visitas, clics y pases son eventos sin IP ni cookies, y se borran a los 400 días. De los contactos y las reuniones
          solo se ven cifras: quien los deja no es usuario de PassMe.
        </p>
      </main>
    </div>
  );
}
