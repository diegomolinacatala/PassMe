import Link from "next/link";
import { formatDate } from "@/lib/admin/format";
import { providerLabel } from "@/lib/admin/labels";
import type { AdminUserRow } from "@/lib/admin/users";
import { PATTERN_LABELS } from "@/lib/card/pattern";
import { cn } from "@/lib/cn";
import { CardLink, Count, TEXT_LINK } from "./crm-ui";

interface UsersTableProps {
  users: AdminUserRow[];
  days: number;
}

function Status({ user }: { user: AdminUserRow }) {
  if (!user.slug) return <span className="text-muted">Sin tarjeta</span>;
  return user.published ? <span>Publicada</span> : <span className="text-muted">Oculta</span>;
}

function Origin({ user }: { user: AdminUserRow }) {
  // A scan or a shared link with no referrer left: that card was deleted since.
  if (!user.referrer && user.via) return <span className="text-muted">Una tarjeta ya borrada</span>;
  if (user.referrer) {
    return (
      <Link href={`/crm/usuarios/${user.referrer.id}`} className={cn(TEXT_LINK, "font-normal")}>
        {user.referrer.name}
      </Link>
    );
  }
  return <span className="text-muted">{user.referralKnown ? "Por su cuenta" : "—"}</span>;
}

/** Everyone who signed up. Wide: it scrolls sideways on its own, never the page. */
export function UsersTable({ users, days }: UsersTableProps) {
  if (users.length === 0) return <p className="rounded-panel border hairline bg-card p-5 text-sm text-muted">Nadie coincide con lo que buscas.</p>;

  const th = "px-3 py-2.5 font-medium whitespace-nowrap";
  const num = `${th} text-right`;
  const td = "px-3 py-2.5 whitespace-nowrap";
  return (
    <div role="region" className="overflow-x-auto rounded-panel border hairline bg-card" tabIndex={0} aria-label="Usuarios (se desplaza de lado)">
      <table className="w-full min-w-[72rem] text-left text-sm">
        <caption className="sr-only">Usuarios de PassMe y su actividad en los últimos {days} días</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th scope="col" className={th}>Persona</th>
            <th scope="col" className={th}>Email</th>
            <th scope="col" className={th}>Alta</th>
            <th scope="col" className={th}>Último acceso</th>
            <th scope="col" className={th}>Tarjeta</th>
            <th scope="col" className={num}>Apple Wallet</th>
            <th scope="col" className={num}>Visitas</th>
            <th scope="col" className={num}>Guardados</th>
            <th scope="col" className={num}>Clics</th>
            <th scope="col" className={num}>Contactos</th>
            <th scope="col" className={num}>Reuniones</th>
            <th scope="col" className={th}>Llegó desde</th>
            <th scope="col" className={num}>Ha traído</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-t hairline align-top">
              <th scope="row" className="px-3 py-2.5 font-normal">
                <Link href={`/crm/usuarios/${user.id}`} className={cn(TEXT_LINK, "flex")}>
                  {user.name || user.email || "Sin nombre"}
                </Link>
                {user.slug ? <CardLink slug={user.slug} /> : null}
                {user.company || user.headline ? (
                  <span className="block max-w-[16rem] truncate text-xs text-muted">{[user.headline, user.company].filter(Boolean).join(" · ")}</span>
                ) : null}
              </th>
              <td className="px-3 py-2.5 text-ink-soft">
                {user.email ?? "—"}
                {user.provider ? <span className="block text-xs text-muted">{providerLabel(user.provider)}</span> : null}
              </td>
              <td className={td}>{formatDate(user.createdAt)}</td>
              <td className={td}>{formatDate(user.lastSignInAt)}</td>
              <td className={td}>
                <Status user={user} />
                {user.pattern ? <span className="block text-xs text-muted">{PATTERN_LABELS[user.pattern].name}</span> : null}
              </td>
              <td className={`${td} text-right`}>
                {user.appleDevices > 0 ? (
                  <span className="tabular-nums">
                    Sí <span className="text-muted">· {user.appleDevices} disp.</span>
                  </span>
                ) : (
                  <span className="text-muted">No</span>
                )}
              </td>
              <td className={`${td} text-right`}><Count value={user.views} /></td>
              <td className={`${td} text-right`}><Count value={user.vcards} /></td>
              <td className={`${td} text-right`}><Count value={user.linkClicks} /></td>
              <td className={`${td} text-right`}><Count value={user.contactRequests} /></td>
              <td className={`${td} text-right`}><Count value={user.meetings} /></td>
              <td className={td}><Origin user={user} /></td>
              <td className={`${td} text-right`}><Count value={user.referred} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
