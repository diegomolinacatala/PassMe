import { formatDate, formatNumber } from "@/lib/admin/format";
import type { AdminUserRow } from "@/lib/admin/stats";
import { PATTERN_LABELS } from "@/lib/card/pattern";
import { cn } from "@/lib/cn";

interface UsersTableProps {
  users: AdminUserRow[];
  days: number;
}

function Status({ user }: { user: AdminUserRow }) {
  if (!user.slug) return <span className="text-muted">Sin tarjeta</span>;
  return user.published ? <span>Publicada</span> : <span className="text-muted">Oculta</span>;
}

function Count({ value }: { value: number }) {
  return <span className={cn("tabular-nums", value === 0 && "text-muted")}>{value === 0 ? "—" : formatNumber(value)}</span>;
}

/** Everyone who signed up, newest first. Wide: it scrolls sideways on its own, never the page. */
export function UsersTable({ users, days }: UsersTableProps) {
  if (users.length === 0) return <p className="text-sm text-muted">Aún no se ha registrado nadie.</p>;

  const th = "px-3 py-2.5 font-medium whitespace-nowrap";
  const num = cn(th, "text-right");
  return (
    <div className="overflow-x-auto rounded-panel border hairline bg-card" tabIndex={0} aria-label="Usuarios (se desplaza de lado)">
      <table className="w-full min-w-[56rem] text-left text-sm">
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
            <th scope="col" className={num}>Contactos</th>
            <th scope="col" className={num}>Reuniones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-t hairline align-top">
              <th scope="row" className="px-3 py-2.5 font-normal">
                <span className="block font-medium text-ink">{user.name || "Sin nombre"}</span>
                {user.slug ? (
                  <a
                    href={`/u/${encodeURIComponent(user.slug)}`}
                    target="_blank"
                    rel="noopener"
                    className="font-mono text-xs text-signal-deep underline-offset-2 hover:underline"
                  >
                    /u/{user.slug}
                  </a>
                ) : null}
                {user.pattern ? <span className="block text-xs text-muted">{PATTERN_LABELS[user.pattern].name}</span> : null}
              </th>
              <td className="px-3 py-2.5 text-ink-soft">{user.email ?? "—"}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(user.createdAt)}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(user.lastSignInAt)}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <Status user={user} />
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                {user.appleDevices > 0 ? (
                  <span className="tabular-nums">
                    Sí <span className="text-muted">· {user.appleDevices} disp.</span>
                  </span>
                ) : (
                  <span className="text-muted">No</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right"><Count value={user.views} /></td>
              <td className="px-3 py-2.5 text-right"><Count value={user.vcards} /></td>
              <td className="px-3 py-2.5 text-right"><Count value={user.contactRequests} /></td>
              <td className="px-3 py-2.5 text-right"><Count value={user.meetings} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
