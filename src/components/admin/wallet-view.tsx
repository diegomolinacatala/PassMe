import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate, formatNumber, formatPercent } from "@/lib/admin/format";
import { plural } from "@/lib/admin/labels";
import type { AdminRawData } from "@/lib/admin/types";
import type { AdminUserRow } from "@/lib/admin/users";
import type { WalletOverview } from "@/lib/admin/wallet";
import { cn } from "@/lib/cn";
import { CardLink, DataNotices, GeneratedAt, PageHeading, PeriodFilter, Section, TEXT_LINK, Tile, Tiles } from "./crm-ui";

interface WalletViewProps {
  overview: WalletOverview;
  raw: Pick<AdminRawData, "demo" | "warnings" | "insightsPending">;
  generatedAt: Date;
}

interface Column {
  label: string;
  numeric?: boolean;
  cell: (row: AdminUserRow) => ReactNode;
}

function Person({ row }: { row: AdminUserRow }) {
  return (
    <>
      <Link href={`/crm/usuarios/${row.id}`} className={cn(TEXT_LINK, "flex")}>
        {row.name || "Sin nombre"}
      </Link>
      {row.slug ? <CardLink slug={row.slug} /> : null}
    </>
  );
}

function PeopleTable({ caption, rows, columns, empty }: { caption: string; rows: AdminUserRow[]; columns: Column[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  const th = "px-3 py-2.5 font-medium whitespace-nowrap";
  return (
    <div role="region" className="-mx-5 overflow-x-auto sm:-mx-6" tabIndex={0} aria-label={`${caption} (se desplaza de lado)`}>
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th scope="col" className={`${th} pl-5 sm:pl-6`}>Persona</th>
            <th scope="col" className={th}>Email</th>
            {columns.map((c) => (
              <th key={c.label} scope="col" className={`${th} ${c.numeric ? "text-right" : ""} last:pr-5 sm:last:pr-6`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t hairline align-top">
              <th scope="row" className="py-2.5 pr-3 pl-5 font-normal sm:pl-6">
                <Person row={row} />
              </th>
              <td className="px-3 py-2.5 text-ink-soft">{row.email ?? "—"}</td>
              {columns.map((c) => (
                <td key={c.label} className={`px-3 py-2.5 whitespace-nowrap ${c.numeric ? "text-right tabular-nums" : ""} last:pr-5 sm:last:pr-6`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WalletView({ overview, raw, generatedAt }: WalletViewProps) {
  const { days } = overview;
  const googleTaps = overview.triedGoogle.reduce((sum, r) => sum + r.googlePassTaps, 0);
  return (
    <>
      <PageHeading eyebrow="Wallet" title="Quién la tiene" accent="en el móvil." aside={<PeriodFilter days={days} path="/crm/wallet" />}>
        <p>
          <GeneratedAt at={generatedAt} />
        </p>
      </PageHeading>

      <DataNotices demo={raw.demo} warnings={raw.warnings} insightsPending={false} />

      <Tiles className="mt-8 sm:grid-cols-4">
        <Tile label="En Apple Wallet" value={overview.appleCards} note={`${formatPercent(overview.publishedWithPass, overview.publishedCards)} de las publicadas`} />
        <Tile label="Dispositivos Apple" value={overview.appleDevices} note="iPhone y Apple Watch aparte" />
        <Tile label="Publicadas sin pase" value={overview.withoutPass.length} note="ningún dispositivo Apple" />
        <Tile label="Pulsaron Google Wallet" value={overview.triedGoogle.length} note={`${plural(googleTaps, "vez", "veces")} en ${days} días`} />
      </Tiles>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
        <Section id="installed" number="01" title="Tienen el pase en Apple Wallet" aside="Apple avisa al añadirlo y al borrarlo: esta lista es exacta">
          <PeopleTable
            caption="Usuarios con el pase en Apple Wallet"
            rows={overview.installed}
            empty="Nadie tiene todavía el pase en Apple Wallet."
            columns={[
              { label: "Dispositivos", numeric: true, cell: (r) => formatNumber(r.appleDevices) },
              { label: "Lo tiene desde", cell: (r) => formatDate(r.walletSince) },
              { label: `Visitas (${days} días)`, numeric: true, cell: (r) => formatNumber(r.views) },
            ]}
          />
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section id="tried-apple" number="02" title="Lo intentaron y no lo tienen" aside={`Apple, ${days} días`}>
            <PeopleTable
              caption="Pulsaron Añadir a Apple Wallet pero no tienen el pase"
              rows={overview.triedApple}
              empty="Nadie: todos los que lo pulsaron lo tienen."
              columns={[{ label: "Veces", numeric: true, cell: (r) => formatNumber(r.applePassTaps) }]}
            />
            <p className="mt-4 text-sm text-muted">No llegaron a añadirlo o lo borraron después. Buen momento para escribirles.</p>
          </Section>

          <Section id="tried-google" number="03" title="Pulsaron «Añadir a Google Wallet»" aside={`${days} días`}>
            <PeopleTable
              caption="Pulsaron Añadir a Google Wallet"
              rows={overview.triedGoogle}
              empty="Nadie en este periodo."
              columns={[{ label: "Veces", numeric: true, cell: (r) => formatNumber(r.googlePassTaps) }]}
            />
            <p className="mt-4 text-sm text-muted">Google no avisa cuando alguien guarda o borra un pase: no se puede saber quién lo conserva.</p>
          </Section>
        </div>

        <Section id="without" number="04" title="Tarjeta publicada, sin pase en Apple Wallet">
          <PeopleTable
            caption="Tarjetas publicadas sin pase en Apple Wallet"
            rows={overview.withoutPass}
            empty="Todas las tarjetas publicadas tienen el pase en algún dispositivo Apple."
            columns={[
              { label: "Alta", cell: (r) => formatDate(r.createdAt) },
              { label: `Visitas (${days} días)`, numeric: true, cell: (r) => formatNumber(r.views) },
            ]}
          />
          <p className="mt-4 text-sm text-muted">Pueden usar Android (Google Wallet), «Mi QR» o, simplemente, no haberlo añadido aún.</p>
        </Section>
      </div>
    </>
  );
}
