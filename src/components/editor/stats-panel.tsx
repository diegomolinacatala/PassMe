import type { CardStats } from "@/lib/data/cards";
import { linkTitle } from "@/lib/card/links";
import type { CardLink } from "@/lib/card/types";

interface StatsPanelProps {
  stats: CardStats;
  links: CardLink[];
  demo: boolean;
}

function Sparkline({ data, days }: { data: CardStats["dailyViews"]; days: number }) {
  const counts = new Map(data.map((d) => [d.day, d.count]));
  const series: number[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    series.push(counts.get(day.toISOString().slice(0, 10)) ?? 0);
  }
  const max = Math.max(1, ...series);
  const barWidth = 100 / series.length;

  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-14 w-full" role="img" aria-label={`Visitas diarias de los últimos ${days} días`}>
      {series.map((count, i) => {
        const h = count === 0 ? 1 : Math.max(3, (count / max) * 30);
        return (
          <rect
            key={i}
            x={i * barWidth + barWidth * 0.18}
            y={32 - h}
            width={barWidth * 0.64}
            height={h}
            rx={0.6}
            className={count === 0 ? "fill-line" : "fill-signal"}
          />
        );
      })}
    </svg>
  );
}

export function StatsPanel({ stats, links, demo }: StatsPanelProps) {
  const tiles = [
    { label: "Visitas", value: stats.views },
    { label: "Desde el QR", value: stats.qrViews },
    { label: "Contactos guardados", value: stats.vcardDownloads },
    { label: "Añadidos a cartera", value: stats.walletAdds },
  ];
  const topLinks = links
    .map((link) => ({ link, clicks: stats.linkClicks[link.id] ?? 0 }))
    .filter((row) => row.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);
  const maxClicks = Math.max(1, ...topLinks.map((r) => r.clicks));

  return (
    <div>
      {demo ? <p className="mb-4 text-sm text-muted">En modo demo no se guardan métricas.</p> : null}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border hairline bg-ink/10">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-card px-4 py-3.5">
            <dt className="text-xs text-muted">{tile.label}</dt>
            <dd className="mt-1 font-display text-[2.1rem] leading-none tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <p className="eyebrow mb-2">Últimos {stats.days} días</p>
        <Sparkline data={stats.dailyViews} days={stats.days} />
      </div>

      <div className="mt-5">
        <p className="eyebrow mb-3">Contactos más usados</p>
        {topLinks.length > 0 ? (
          <ul className="space-y-2.5">
            {topLinks.map(({ link, clicks }) => (
              <li key={link.id} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span className="truncate">{linkTitle(link)}</span>
                  <span className="font-mono tabular-nums text-muted">{clicks}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/70">
                  <div className="h-full rounded-full bg-ink" style={{ width: `${(clicks / maxClicks) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aún no hay clics. Enseña tu tarjeta y vuelve por aquí.</p>
        )}
      </div>
      <p className="mt-5 text-xs text-muted">Sin cookies ni IPs: solo contamos eventos anónimos por tarjeta.</p>
    </div>
  );
}
