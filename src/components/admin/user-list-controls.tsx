import { Download, Search } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input-classes";
import { MAX_SEARCH_LENGTH, USER_FILTERS, USER_SORTS, type UserListQuery } from "@/lib/admin/users";
import { PillLinks } from "./crm-ui";

interface UserListControlsProps {
  query: UserListQuery;
  days: number;
}

function href(params: Record<string, string>): string {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ""));
  return `/crm/usuarios${query.size > 0 ? `?${query}` : ""}`;
}

/**
 * Search, order and filters as a plain GET form and links: no JavaScript, and
 * every view of the list has its own address (and its own spreadsheet).
 */
export function UserListControls({ query, days }: UserListControlsProps) {
  const base = { q: query.search, orden: query.sort === "alta" ? "" : query.sort, d: String(days) };
  const csv = `/crm/usuarios.csv?${new URLSearchParams({ ...base, f: query.filter, orden: query.sort })}`;
  return (
    <div className="space-y-4">
      <form action="/crm/usuarios" method="get" role="search" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="f" value={query.filter} />
        <input type="hidden" name="d" value={days} />
        <label className="min-w-0 flex-[1_1_16rem]">
          <span className="mb-1.5 block text-sm font-medium text-ink">Buscar</span>
          <span className="relative block">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              name="q"
              defaultValue={query.search}
              maxLength={MAX_SEARCH_LENGTH}
              placeholder="Nombre, email, enlace o empresa"
              className={inputClasses({ className: "pl-9" })}
            />
          </span>
        </label>
        <label className="flex-[0_1_14rem]">
          <span className="mb-1.5 block text-sm font-medium text-ink">Ordenar por</span>
          <select name="orden" defaultValue={query.sort} className={inputClasses()}>
            {Object.entries(USER_SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClasses({ variant: "ink", className: "min-h-12" })}>
          Aplicar
        </button>
        <a href={csv} className={buttonClasses({ variant: "outline", className: "min-h-12 sm:ml-auto" })} download>
          <Download aria-hidden className="size-4" />
          Descargar CSV
        </a>
      </form>
      <PillLinks
        label="Filtrar usuarios"
        items={Object.entries(USER_FILTERS).map(([value, label]) => ({
          href: href({ ...base, f: value === "todos" ? "" : value }),
          label,
          active: value === query.filter,
        }))}
      />
    </div>
  );
}
