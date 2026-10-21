import { Contact, Eye, MousePointerClick, Sparkles, UserPlus, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ACTIVITY_FILTERS, type ActivityFilter, type ActivityItem, type ActivityKind } from "@/lib/admin/activity";
import { dayKey } from "@/lib/admin/days";
import { formatClock, formatLongDay, formatNumber } from "@/lib/admin/format";
import { PillLinks, TEXT_LINK } from "./crm-ui";

const ICONS: Record<ActivityKind, LucideIcon> = {
  signup: UserPlus,
  card: Sparkles,
  wallet: Wallet,
  view: Eye,
  vcard: Contact,
  link_click: MousePointerClick,
  pass_apple: Wallet,
  pass_google: Wallet,
  contact: Contact,
  meeting: Contact,
};

interface ActivityFeedProps {
  items: ActivityItem[];
  total: number;
  filter: ActivityFilter;
  days: number;
}

/** Items grouped under their day (Madrid), newest first. */
function byDay(items: ActivityItem[]): Array<{ day: string; items: ActivityItem[] }> {
  const groups: Array<{ day: string; items: ActivityItem[] }> = [];
  for (const item of items) {
    const day = dayKey(item.at);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

export function ActivityFeed({ items, total, filter, days }: ActivityFeedProps) {
  return (
    <div className="space-y-6">
      <PillLinks
        label="Qué mostrar"
        items={Object.entries(ACTIVITY_FILTERS).map(([value, label]) => ({
          href: `/crm/actividad?${new URLSearchParams({ ...(value === "todo" ? {} : { tipo: value }), d: String(days) })}`,
          label,
          active: value === filter,
        }))}
      />
      {items.length === 0 ? (
        <p className="rounded-panel border hairline bg-card p-5 text-sm text-muted">No ha pasado nada de esto en {days} días.</p>
      ) : (
        <div className="space-y-4">
          {byDay(items).map((group) => (
            <section key={group.day} aria-labelledby={`day-${group.day}`} className="rounded-panel border hairline bg-card p-5 sm:p-6">
              <h2 id={`day-${group.day}`} className="eyebrow mb-4">
                {formatLongDay(group.day)}
              </h2>
              <ol className="space-y-3 text-sm">
                {group.items.map((item, i) => {
                  const Icon = ICONS[item.kind];
                  return (
                    <li key={`${item.at}-${item.kind}-${i}`} className="grid grid-cols-[3rem_1.25rem_minmax(0,1fr)] items-baseline gap-2">
                      <time dateTime={item.at} className="font-mono text-xs text-muted tabular-nums">
                        {formatClock(new Date(item.at))}
                      </time>
                      <Icon aria-hidden className="size-4 translate-y-0.5 text-signal-deep" />
                      <span className="min-w-0">
                        <Link href={`/crm/usuarios/${item.profileId}`} className={TEXT_LINK}>
                          {item.name}
                        </Link>{" "}
                        <span className="text-ink-soft">{item.text}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {total > items.length ? (
            <p className="text-sm text-muted">
              Se ven los {formatNumber(items.length)} más recientes de {formatNumber(total)}. Elige un periodo más corto o un tipo para ver el resto.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
