import { CalendarClock, Contact, Download } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatDate, formatNumber, formatPercent } from "@/lib/admin/format";
import { MEETING_FORMAT_LABELS, MEETING_STATUS_ONE, SOURCE_LABELS } from "@/lib/admin/labels";
import type { Lead } from "@/lib/admin/leads";
import type { AdminUserDetail } from "@/lib/admin/user-detail";
import { contactEmailHref, contactPhoneHref } from "@/lib/card/contact-info";
import { cn } from "@/lib/cn";
import { BarList } from "./bar-list";
import { CardLink, Chip, PageHeading, Section, TEXT_LINK, Tile, Tiles } from "./crm-ui";

export type LeadsState =
  | { kind: "signed-out" }
  | {
      kind: "ready";
      demo: boolean;
      email: string | null;
      card: { slug: string; name: string } | null;
      leads: Lead[];
      /** Couldn't read the card, the contacts or the meetings: what shows may be incomplete. */
      failed: boolean;
      /** The card's own numbers (anonymous saves, visits); null without a card. */
      detail: AdminUserDetail | null;
    };

const textLink = cn(TEXT_LINK, "font-normal");

function SignedOut() {
  return (
    <>
      <PageHeading eyebrow="Mis contactos" title="Tu" accent="gente." />
      <div className="mt-8 max-w-xl space-y-5">
        <Notice tone="info" title="Entra también con tu cuenta de PassMe">
          Tus contactos solo se ven con la sesión de tu tarjeta, como en tu editor. Entra en este navegador y vuelve aquí.
        </Notice>
        <LinkButton href="/login?next=/crm/contactos" variant="ink">
          Entrar con mi email
        </LinkButton>
      </div>
    </>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium text-ink">
          {lead.name}
          {lead.company ? <span className="font-normal text-ink-soft"> · {lead.company}</span> : null}
        </p>
        <p className="text-sm text-muted">{lead.touches.length > 1 ? `${lead.touches.length} veces · desde el ${formatDate(lead.firstAt)}` : formatDate(lead.lastAt)}</p>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm [overflow-wrap:anywhere]">
        {lead.email ? (
          <a href={contactEmailHref(lead.email)} className={textLink}>
            {lead.email}
          </a>
        ) : null}
        {lead.phone ? (
          <a href={contactPhoneHref(lead.phone)} className={textLink}>
            {lead.phone}
          </a>
        ) : null}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {lead.touches.map((touch) => {
          const Icon = touch.kind === "contact" ? Contact : CalendarClock;
          return (
            <li key={touch.id} className="flex gap-2 text-ink-soft">
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-signal-deep" />
              <span className="min-w-0">
                {touch.kind === "contact" ? "Te dejó su contacto" : "Te propuso una reunión"}
                {" · "}
                {formatDate(touch.at)} · {SOURCE_LABELS[touch.source] ?? touch.source}
                {touch.kind === "meeting" ? (
                  <>
                    {" · "}
                    {MEETING_FORMAT_LABELS[touch.format ?? ""] ?? touch.format} · {MEETING_STATUS_ONE[touch.status ?? ""] ?? touch.status}
                    {touch.confirmedStart ? ` para el ${formatDate(touch.confirmedStart)}` : ""}
                  </>
                ) : null}
                {touch.note ? <span className="mt-0.5 block text-ink">«{touch.note}»</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export function LeadsView({ state }: { state: LeadsState }) {
  if (state.kind === "signed-out") return <SignedOut />;
  const { detail, leads, card } = state;
  const contacts = leads.reduce((n, l) => n + l.touches.filter((t) => t.kind === "contact").length, 0);
  const meetings = leads.reduce((n, l) => n + l.touches.filter((t) => t.kind === "meeting").length, 0);
  const vcardTotal = detail?.activity.vcards ?? 0;
  const days = detail?.days ?? 90;

  return (
    <>
      <PageHeading eyebrow="Mis contactos" title="Tu" accent="gente.">
        <p>
          {card ? (
            <>
              Tu tarjeta <CardLink slug={card.slug} className="text-sm" />
            </>
          ) : (
            "Esta cuenta aún no tiene tarjeta"
          )}
          {state.email ? ` · sesión de ${state.email}` : ""}
        </p>
      </PageHeading>

      <div className="mt-6 space-y-3">
        {state.demo ? <Notice tone="info" title="Modo demo">Son contactos de ejemplo.</Notice> : null}
        {state.failed ? (
          <Notice tone="error" title="Faltan datos">
            No hemos podido cargar todo (tu tarjeta, tus contactos o tus reuniones). Recarga la página en un momento.
          </Notice>
        ) : null}
      </div>

      <Tiles className="mt-8 sm:grid-cols-4">
        <Tile label="Personas" value={leads.length} note="te dejaron sus datos" />
        <Tile label="Contactos recibidos" value={contacts} note="«Déjale tu contacto»" />
        <Tile label="Reuniones propuestas" value={meetings} note="«Agendar reunión»" />
        <Tile label="Guardaron tu contacto" value={vcardTotal} note={`en ${days} días, sin saber quién`} />
      </Tiles>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Section
          id="people"
          number="01"
          title="Te dejaron sus datos"
          aside={leads.length > 0 ? `${formatNumber(leads.length)} ${leads.length === 1 ? "persona" : "personas"}` : undefined}
        >
          {leads.length > 0 ? (
            <ul className="divide-y divide-line/70">
              {leads.map((lead) => (
                <LeadCard key={lead.key} lead={lead} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nadie todavía. Activa «Déjale tu contacto» y «Agendar reunión» en tu editor.</p>
          )}
          {!state.demo && contacts > 0 ? (
            <div className="mt-6 flex flex-wrap gap-3 border-t hairline pt-5">
              <LinkButton href="/dashboard/contactos?format=csv" external variant="outline" size="sm" download>
                <Download aria-hidden className="size-4" />
                Contactos en CSV
              </LinkButton>
              <LinkButton href="/dashboard/contactos?format=vcf" external variant="ghost" size="sm" download>
                <Download aria-hidden className="size-4" />
                Para la agenda del móvil (.vcf)
              </LinkButton>
            </div>
          ) : null}
        </Section>

        <Section id="saved" number="02" title="Guardaron tu contacto" aside={`${formatNumber(vcardTotal)} en ${days} días`}>
          <p className="text-sm text-ink-soft">
            Quien pulsa «Guardar contacto» descarga tu ficha en su móvil y su agenda no nos avisa: se sabe cuántos y desde dónde,
            nunca quién. Para saber quién, que te dejen su contacto.
          </p>
          {detail ? (
            <div className="mt-5 space-y-5">
              <BarList
                max={vcardTotal}
                rows={detail.vcardPlatforms.map((p) => ({ label: p.label, value: p.count, note: formatPercent(p.count, vcardTotal) }))}
                empty="Sin guardados con el tipo de móvil todavía."
              />
              <p className="flex flex-wrap gap-2">
                <Chip>{formatNumber(detail.activity.views)} visitas</Chip>
                <Chip>{formatNumber(detail.activity.qr)} por el QR</Chip>
                <Chip>{formatPercent(vcardTotal, detail.activity.views)} guardan tu contacto</Chip>
              </p>
            </div>
          ) : null}
        </Section>
      </div>
    </>
  );
}
