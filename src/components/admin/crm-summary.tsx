import Link from "next/link";
import { formatDate, formatNumber, formatPercent, formatShortDay } from "@/lib/admin/format";
import { plural } from "@/lib/admin/labels";
import type { AdminStats, Ranked } from "@/lib/admin/stats";
import { PATTERN_LABELS } from "@/lib/card/pattern";
import { BarList } from "./bar-list";
import { ColumnChart } from "./column-chart";
import { CardLink, DataNotices, GeneratedAt, PageHeading, PeriodFilter, Section, TEXT_LINK, Tile, Tiles } from "./crm-ui";
import { dailyColumns } from "./daily-columns";

interface CrmSummaryProps {
  stats: AdminStats;
  generatedAt: Date;
}

/** Each row's share of `total` (which may include rows that aren't listed). */
function Shares({ rows, total, empty }: { rows: Ranked[]; total: number; empty: string }) {
  return <BarList max={total} rows={rows.map((r) => ({ label: r.label, value: r.count, note: formatPercent(r.count, total) }))} empty={empty} />;
}

function WalletHero({ stats }: { stats: AdminStats }) {
  const { totals, period, days } = stats;
  return (
    <section aria-labelledby="crm-wallet" className="relative overflow-hidden rounded-panel bg-ink p-6 text-paper sm:p-7">
      <h2 id="crm-wallet" className="eyebrow text-glow">
        En la cartera ahora
      </h2>
      <p className="mt-4 text-[4rem] leading-none font-semibold tracking-tight tabular-nums">{formatNumber(totals.appleCards)}</p>
      <p className="mt-2 text-lg">{totals.appleCards === 1 ? "tarjeta" : "tarjetas"} en Apple Wallet</p>
      <p className="mt-1 text-sm text-paper/75">
        En {plural(totals.appleDevices, "dispositivo", "dispositivos")} (el iPhone y el Apple Watch cuentan aparte) ·{" "}
        {formatPercent(totals.publishedWithPass, totals.publishedCards)} de las tarjetas publicadas
      </p>
      <div className="mt-6 border-t border-paper/15 pt-4 text-sm text-paper/75">
        <p>
          Pulsaron «Añadir a Apple Wallet» {plural(period.applePassTaps, "vez", "veces")} y «Añadir a Google Wallet»{" "}
          {plural(period.googlePassTaps, "vez", "veces")} en {days} días.
        </p>
        <p className="mt-2">
          <Link href="/crm/wallet" className="inline-flex min-h-6 items-center font-medium text-paper underline underline-offset-4 hover:text-glow">
            Ver quién la tiene
          </Link>
        </p>
      </div>
    </section>
  );
}

function Overview({ stats }: { stats: AdminStats }) {
  const { totals, period, days } = stats;
  const ofViews = (n: number) => formatPercent(n, period.views);
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <WalletHero stats={stats} />
      <Tiles className="self-start">
        <Tile label="Usuarios" value={totals.users} note={`+${formatNumber(period.newUsers)} en ${days} días`} />
        <Tile label="Han entrado" value={period.activeUsers} note={`en ${days} días`} />
        <Tile label="Tarjetas publicadas" value={totals.publishedCards} note={`de ${formatNumber(totals.cards)} creadas`} />
        <Tile label="Visitas" value={period.views} note={`a ${plural(period.viewedCards, "tarjeta", "tarjetas")}`} />
        <Tile label="Escaneos del QR" value={period.qrViews} note={`${ofViews(period.qrViews)} de las visitas`} />
        <Tile label="Guardaron el contacto" value={period.vcards} note={`${ofViews(period.vcards)} de las visitas`} />
      </Tiles>
    </div>
  );
}

function VisitSections({ stats }: { stats: AdminStats }) {
  const { totals, period, days } = stats;
  const ofViews = (n: number) => formatPercent(n, period.views);
  return (
    <>
      <Section id="daily" number="02" title="Visitas por día" aside={`${formatNumber(period.views)} en ${days} días`}>
        <ColumnChart data={dailyColumns(stats.daily)} title="Visitas por día" unit="visitas" />
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section id="actions" number="03" title="Al ver una tarjeta" aside="Sobre las visitas">
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
            En total: {plural(totals.contactRequests, "contacto recibido", "contactos recibidos")} y{" "}
            {plural(totals.meetings, "reunión propuesta", "reuniones propuestas")} ({formatNumber(totals.meetingsConfirmed)} confirmadas).
          </p>
        </Section>
        <Section id="sources" number="04" title="De dónde llegan" aside={`${days} días`}>
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
      <div className="grid gap-4 lg:grid-cols-2">
        <Section id="devices" number="05" title="Con qué móvil" aside={`${formatNumber(stats.recorded.devices)} visitas con el dato`}>
          <Shares rows={stats.devices} total={stats.recorded.devices} empty="Aún no hay visitas con el tipo de móvil (se guarda desde esta versión)." />
        </Section>
        <Section id="countries" number="06" title="Desde qué país" aside={`${formatNumber(stats.recorded.countries)} visitas con el dato`}>
          <Shares rows={stats.countries} total={stats.recorded.countries} empty="Aún no hay visitas con el país (se guarda desde esta versión)." />
        </Section>
      </div>
    </>
  );
}

function OriginsSection({ stats }: { stats: AdminStats }) {
  const { origins } = stats;
  const known = origins.qr + origins.share + origins.direct + origins.ownWay;
  return (
    <Section id="origins" number="08" title="Cómo llegan los nuevos" aside={`${formatNumber(known)} con el dato`}>
      <BarList
        max={known}
        rows={[
          { label: "Desde una tarjeta, escaneando el QR", value: origins.qr, note: formatPercent(origins.qr, known) },
          { label: "Desde una tarjeta, con un enlace", value: origins.share, note: formatPercent(origins.share, known) },
          { label: "Desde una tarjeta, abriéndola", value: origins.direct, note: formatPercent(origins.direct, known) },
          { label: "Por su cuenta", value: origins.ownWay, note: formatPercent(origins.ownWay, known) },
        ]}
      />
      <h3 className="mt-6 text-sm font-medium text-ink">Quién trae gente</h3>
      {stats.topReferrers.length > 0 ? (
        <ol className="mt-2 space-y-1.5 text-sm">
          {stats.topReferrers.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-3">
              <Link href={`/crm/usuarios/${r.key}`} className={TEXT_LINK}>
                {r.label}
              </Link>
              <span className="tabular-nums text-ink-soft">{plural(r.count, "alta", "altas")}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted">Nadie todavía.</p>
      )}
      {origins.unknown > 0 ? (
        <p className="mt-4 text-sm text-muted">
          {plural(origins.unknown, "cuenta es", "cuentas son")} de antes de guardar este dato.
        </p>
      ) : null}
    </Section>
  );
}

function GrowthSections({ stats }: { stats: AdminStats }) {
  const weekly = stats.weekly.map((w) => ({
    key: w.week,
    label: `Semana del ${formatShortDay(w.week)}`,
    axisLabel: formatShortDay(w.week),
    value: w.signups,
    detail: `${formatNumber(w.total)} en total`,
  }));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <Section id="weekly" number="07" title="Altas por semana" aside={`${formatNumber(stats.totals.users)} usuarios en total`}>
        <ColumnChart data={weekly} title="Altas por semana" unit="altas" tone="ink" />
      </Section>
      <OriginsSection stats={stats} />
    </div>
  );
}

function RankingSections({ stats }: { stats: AdminStats }) {
  const { period, days } = stats;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section id="top-cards" number="09" title="Tarjetas más vistas" aside={`${days} días`}>
        {stats.topCards.length > 0 ? (
          <ol className="space-y-3 text-sm">
            {stats.topCards.map((card, i) => (
              <li key={card.id} className="flex items-baseline gap-3">
                <span className="w-4 shrink-0 font-mono text-xs text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <Link href={`/crm/usuarios/${card.id}`} className={TEXT_LINK}>
                    {card.name}
                  </Link>{" "}
                  {card.slug ? <CardLink slug={card.slug} /> : null}
                </span>
                <span className="shrink-0 text-right tabular-nums text-ink-soft">
                  {plural(card.views, "visita", "visitas")} · {plural(card.vcards, "guardado", "guardados")}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">Aún no hay visitas en este periodo.</p>
        )}
      </Section>
      <Section id="links" number="10" title="Enlaces más pulsados" aside={plural(period.linkClicks, "clic", "clics")}>
        <BarList rows={stats.linkKinds.map((l) => ({ label: l.label, value: l.count }))} empty="Nadie ha pulsado un enlace en este periodo." />
      </Section>
    </div>
  );
}

function CardsSections({ stats }: { stats: AdminStats }) {
  const { totals } = stats;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Section id="patterns" number="11" title="Motivos elegidos" aside={plural(totals.cards, "tarjeta", "tarjetas")}>
        <BarList
          max={totals.cards}
          rows={stats.patterns.map((p) => ({ label: PATTERN_LABELS[p.pattern].name, value: p.count, note: formatPercent(p.count, totals.cards) }))}
          empty="Aún no hay tarjetas."
        />
      </Section>
      <Section id="recent" number="12" title="Últimas altas" aside={<Link href="/crm/usuarios" className={TEXT_LINK}>Ver todos</Link>}>
        {stats.recentUsers.length > 0 ? (
          <ul className="divide-y divide-line/70 text-sm">
            {stats.recentUsers.map((u) => (
              <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <Link href={`/crm/usuarios/${u.id}`} className={TEXT_LINK}>
                    {u.name || u.email || "Sin nombre"}
                  </Link>
                  {u.referrer ? <span className="text-muted"> · vino de {u.referrer.name}</span> : null}
                </span>
                <span className="text-ink-soft">{formatDate(u.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aún no se ha registrado nadie.</p>
        )}
      </Section>
    </div>
  );
}

export function CrmSummary({ stats, generatedAt }: CrmSummaryProps) {
  const { totals, days } = stats;
  return (
    <>
      <PageHeading eyebrow="Resumen" title="Cómo va" accent="PassMe." aside={<PeriodFilter days={days} path="/crm" />}>
        <p>
          <GeneratedAt at={generatedAt} days={days} />
        </p>
      </PageHeading>
      <DataNotices demo={stats.demo} warnings={stats.warnings} insightsPending={stats.insightsPending} />
      <Overview stats={stats} />

      {/* minmax(0, 1fr): wide content scrolls inside its box instead of widening the page. */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
        <Section id="funnel" number="01" title="Embudo" aside="Sobre todas las cuentas">
          <BarList
            max={totals.users}
            rows={stats.funnel.map((step) => ({ label: step.label, value: step.count, note: formatPercent(step.count, totals.users) }))}
          />
        </Section>
        <VisitSections stats={stats} />
        <GrowthSections stats={stats} />
        <RankingSections stats={stats} />
        <CardsSections stats={stats} />
      </div>

      <p className="mt-10 max-w-2xl text-sm text-muted">
        Visitas, clics y pases son eventos sin IP ni cookies, y se borran a los 400 días. De los contactos y las reuniones
        de cada usuario solo se ven cifras: quien los deja no es usuario de PassMe. Los tuyos están en «Mis contactos».
      </p>
    </>
  );
}
