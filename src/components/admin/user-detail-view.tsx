import { ArrowLeft, EyeOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate, formatNumber, formatPercent } from "@/lib/admin/format";
import { plural, providerLabel, VIA_LABELS } from "@/lib/admin/labels";
import type { Ranked } from "@/lib/admin/stats";
import type { AdminUserDetail } from "@/lib/admin/user-detail";
import { contactEmailHref } from "@/lib/card/contact-info";
import { TYPEFACE_LABELS, type Typeface } from "@/lib/card/design";
import { PATTERN_LABELS } from "@/lib/card/pattern";
import { BarList } from "./bar-list";
import { ColumnChart } from "./column-chart";
import { CardLink, Chip, DataNotices, PageHeading, Section, TEXT_LINK, Tile, Tiles } from "./crm-ui";
import { dailyColumns } from "./daily-columns";

interface UserDetailViewProps {
  detail: AdminUserDetail;
  demo: boolean;
  warnings: string[];
  insightsPending: boolean;
}

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="divide-y divide-line/70 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function yesNo(value: boolean): string {
  return value ? "Sí" : "No";
}

function typefaceName(value: string): string {
  return Object.hasOwn(TYPEFACE_LABELS, value) ? TYPEFACE_LABELS[value as Typeface].name : value;
}

/** "QR 3 · Enlace 1", or "—" when there's nothing. */
function inline(rows: Ranked[]): string {
  return rows.map((r) => `${r.label} ${formatNumber(r.count)}`).join(" · ") || "—";
}

function Shares({ rows, empty }: { rows: Ranked[]; empty: string }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  return <BarList max={total} rows={rows.map((r) => ({ label: r.label, value: r.count, note: formatPercent(r.count, total) }))} empty={empty} />;
}

function Heading({ detail }: { detail: AdminUserDetail }) {
  const { row, profile } = detail;
  const about = [profile?.headline, profile?.company, profile?.location].filter(Boolean);
  return (
    <PageHeading eyebrow="Ficha" title={row.name || row.email || "Sin nombre"}>
      {about.length > 0 ? <p>{about.join(" · ")}</p> : null}
      <p className="mt-3 flex flex-wrap gap-2">
        {!row.slug ? <Chip tone="muted">Sin tarjeta</Chip> : row.published ? <Chip>Publicada</Chip> : <Chip tone="muted">Oculta</Chip>}
        {row.appleDevices > 0 ? (
          <Chip tone="signal">Apple Wallet · {plural(row.appleDevices, "dispositivo", "dispositivos")}</Chip>
        ) : (
          <Chip tone="muted">Sin pase en Apple Wallet</Chip>
        )}
        {row.referred > 0 ? <Chip>Ha traído a {formatNumber(row.referred)}</Chip> : null}
      </p>
    </PageHeading>
  );
}

function AccountSection({ detail }: { detail: AdminUserDetail }) {
  const { row } = detail;
  const origin = row.referrer ? (
    <>
      <Link href={`/crm/usuarios/${row.referrer.id}`} className={TEXT_LINK}>
        {row.referrer.name}
      </Link>
      <span className="text-ink-soft">, {VIA_LABELS[row.via ?? "direct"]}</span>
    </>
  ) : row.referralKnown ? (
    "Por su cuenta"
  ) : (
    <span className="text-muted">Sin dato (cuenta anterior a este registro)</span>
  );
  return (
    <Section id="account" number="01" title="Cuenta">
      <Facts
        rows={[
          ["Email", row.email ? <a href={contactEmailHref(row.email)} className={TEXT_LINK}>{row.email}</a> : "—"],
          ["Entra con", providerLabel(row.provider)],
          ["Alta", formatDate(row.createdAt)],
          ["Último acceso", formatDate(row.lastSignInAt)],
          ["Llegó desde", origin],
        ]}
      />
      <h3 className="mt-6 text-sm font-medium text-ink">Ha traído</h3>
      {detail.referredUsers.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {detail.referredUsers.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <Link href={`/crm/usuarios/${r.id}`} className={TEXT_LINK}>
                {r.name}
              </Link>
              <span className="text-ink-soft">
                {formatDate(r.createdAt)} · {VIA_LABELS[r.via] ?? r.via}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Nadie todavía.</p>
      )}
    </Section>
  );
}

function CardSection({ detail }: { detail: AdminUserDetail }) {
  const { profile, row } = detail;
  return (
    <Section id="card" number="02" title="Tarjeta">
      {profile ? (
        <Facts
          rows={[
            ["Enlace", <CardLink key="slug" slug={profile.slug} className="text-sm" />],
            ["Publicada", yesNo(profile.isPublished)],
            [
              "Diseño",
              <span key="design" className="inline-flex items-center gap-2">
                <span aria-hidden className="size-4 rounded-full ring-1 ring-ink/15" style={{ backgroundColor: profile.accentColor }} />
                {row.pattern ? PATTERN_LABELS[row.pattern].name : profile.pattern} · {typefaceName(profile.typeface)}
              </span>,
            ],
            ["Foto", yesNo(profile.hasAvatar)],
            ["Biografía", yesNo(profile.hasBio)],
            ["Recibe contactos", yesNo(profile.acceptsContactRequests)],
            ["Acepta reuniones", yesNo(profile.acceptsMeetingRequests)],
            ["Creada", formatDate(profile.createdAt)],
            ["Último cambio", formatDate(profile.updatedAt)],
          ]}
        />
      ) : (
        <p className="text-sm text-muted">Se dio de alta pero aún no ha creado su tarjeta.</p>
      )}
    </Section>
  );
}

function LinksSection({ detail }: { detail: AdminUserDetail }) {
  return (
    <Section id="links" number="03" title="Sus datos de contacto" aside={`Clics en ${detail.days} días`}>
      {detail.links.length > 0 ? (
        <ul className="divide-y divide-line/70 text-sm">
          {detail.links.map((link) => (
            <li key={link.id} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <span className="min-w-0">
                <span className="font-medium text-ink">{link.title}</span>
                {link.visible ? (
                  <span className="block truncate text-ink-soft">{link.value}</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted">
                    <EyeOff aria-hidden className="size-3.5" />
                    Oculto: no se muestra
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-ink-soft">{link.visible ? formatNumber(link.clicks) : "—"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No ha añadido ninguno.</p>
      )}
    </Section>
  );
}

function WalletSection({ detail }: { detail: AdminUserDetail }) {
  const { activity, days } = detail;
  return (
    <Section id="wallet" number="04" title="Su pase en el móvil">
      {detail.devicesAddedAt.length > 0 ? (
        <ol className="space-y-1.5 text-sm">
          {detail.devicesAddedAt.map((addedAt, i) => (
            <li key={`${addedAt}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className="font-medium text-ink">Dispositivo Apple {i + 1}</span>
              <span className="text-ink-soft">Lo añadió el {formatDate(addedAt)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">Ningún dispositivo Apple tiene su pase ahora mismo.</p>
      )}
      <p className="mt-4 text-sm text-muted">
        En {days} días pulsó «Añadir a Apple Wallet» {plural(activity.appleTaps, "vez", "veces")} y «Añadir a Google Wallet»{" "}
        {plural(activity.googleTaps, "vez", "veces")}. Google no avisa de si lo guarda.
      </p>
    </Section>
  );
}

function VisitsSections({ detail }: { detail: AdminUserDetail }) {
  const { activity, days } = detail;
  const ofViews = (n: number) => formatPercent(n, activity.views);
  return (
    <>
      <Section id="daily" number="05" title="Visitas por día" aside={`${formatNumber(activity.views)} en ${days} días`}>
        <ColumnChart data={dailyColumns(detail.daily)} title="Visitas por día" unit="visitas" />
      </Section>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section id="sources" number="06" title="De dónde llegan">
          <BarList
            max={activity.views}
            rows={[
              { label: "Escaneando el QR", value: activity.qr, note: ofViews(activity.qr) },
              { label: "Con un enlace", value: activity.share, note: ofViews(activity.share) },
              { label: "Directo", value: activity.direct, note: ofViews(activity.direct) },
            ]}
          />
        </Section>
        <Section id="devices" number="07" title="Con qué móvil">
          <Shares rows={detail.platforms} empty="Sin visitas con este dato." />
          {detail.vcardPlatforms.length > 0 ? (
            <p className="mt-4 text-sm text-muted">Guardaron su contacto desde: {inline(detail.vcardPlatforms)}</p>
          ) : null}
        </Section>
        <Section id="countries" number="08" title="Desde qué país">
          <Shares rows={detail.countries} empty="Sin visitas con este dato." />
        </Section>
      </div>
    </>
  );
}

function ReceivedSection({ detail }: { detail: AdminUserDetail }) {
  const { contacts, meetings } = detail;
  return (
    <Section id="received" number="09" title="Contactos y reuniones que recibe">
      <Facts
        rows={[
          ["Contactos recibidos", `${formatNumber(contacts.total)}${contacts.last ? ` · el último, el ${formatDate(contacts.last)}` : ""}`],
          ["Por origen", inline(contacts.bySource)],
          ["Reuniones propuestas", `${formatNumber(meetings.total)}${meetings.last ? ` · la última, el ${formatDate(meetings.last)}` : ""}`],
          ["Por estado", inline(meetings.byStatus)],
          ["Por formato", inline(meetings.byFormat)],
        ]}
      />
      <p className="mt-4 text-sm text-muted">Solo cifras: quien deja sus datos se los da a esta persona, no a PassMe.</p>
    </Section>
  );
}

function TimelineSection({ detail }: { detail: AdminUserDetail }) {
  return (
    <Section id="timeline" number="10" title="Historial">
      <ol className="space-y-2.5 text-sm">
        {detail.timeline.map((item, i) => (
          <li key={`${item.at}-${i}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
            <time dateTime={item.at} className="text-muted tabular-nums">
              {formatDate(item.at)}
            </time>
            <span className="text-ink">{item.text}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function UserDetailView({ detail, demo, warnings, insightsPending }: UserDetailViewProps) {
  const { activity, days } = detail;
  const ofViews = (n: number) => formatPercent(n, activity.views);
  return (
    <>
      <Link href="/crm/usuarios" className="mb-6 inline-flex min-h-6 items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Usuarios
      </Link>
      <Heading detail={detail} />
      <DataNotices demo={demo} warnings={warnings} insightsPending={insightsPending} />

      <Tiles className="mt-8 lg:grid-cols-6">
        <Tile label="Visitas" value={activity.views} note={`${days} días`} />
        <Tile label="Escaneos del QR" value={activity.qr} note={`${ofViews(activity.qr)} de las visitas`} />
        <Tile label="Guardaron su contacto" value={activity.vcards} note={`${ofViews(activity.vcards)} de las visitas`} />
        <Tile label="Clics en enlaces" value={activity.clicks} note={`${days} días`} />
        <Tile label="Contactos recibidos" value={detail.contacts.total} note="en total" />
        <Tile label="Reuniones" value={detail.meetings.total} note="en total" />
      </Tiles>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <AccountSection detail={detail} />
          <CardSection detail={detail} />
        </div>
        {detail.profile ? <LinksSection detail={detail} /> : null}
        <WalletSection detail={detail} />
        <VisitsSections detail={detail} />
        <div className="grid gap-4 lg:grid-cols-2">
          <ReceivedSection detail={detail} />
          <TimelineSection detail={detail} />
        </div>
      </div>
    </>
  );
}
