"use client";

import { Download, Mail, Phone, Trash2, UserRoundPlus } from "lucide-react";
import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { deleteContactRequestAction } from "@/app/dashboard/actions";
import { contactEmailHref, contactPhoneHref, type ContactRequest } from "@/lib/card/contact";
import { cn } from "@/lib/cn";

interface ContactsPanelProps {
  requests: ContactRequest[];
  /** False while the database migration for contact requests is pending. */
  available: boolean;
  /** The saved card shows the form. */
  enabled: boolean;
  demo: boolean;
}

const COLLAPSED_COUNT = 4;
const SOURCE_LABEL: Record<ContactRequest["source"], string> = { qr: "QR", share: "Enlace", direct: "Web" };
const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
const ICON_BUTTON =
  "grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:pointer-events-none";
const EXPORT_BUTTON =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/80 px-3.5 text-sm font-medium transition-colors hover:bg-ink hover:text-paper disabled:pointer-events-none disabled:opacity-40";

/** Download link; a disabled button in demo mode (nothing is stored there). */
function ExportLink({ href, demo, children }: { href: string; demo: boolean; children: ReactNode }) {
  if (demo) {
    return (
      <button type="button" disabled className={EXPORT_BUTTON}>
        {children}
      </button>
    );
  }
  return (
    <a href={href} className={EXPORT_BUTTON}>
      {children}
    </a>
  );
}

function ContactItem({ request, demo, onDelete }: { request: ContactRequest; demo: boolean; onDelete: () => void }) {
  const exportHref = `/dashboard/contactos?format=vcf&id=${encodeURIComponent(request.id)}`;
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{request.name}</p>
          <p className="truncate text-sm text-muted">
            {[request.company, dateFormat.format(new Date(request.createdAt)), SOURCE_LABEL[request.source]]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {demo ? (
            <button type="button" disabled className={cn(ICON_BUTTON, "opacity-40")} aria-label={`Guardar a ${request.name} en tus contactos`}>
              <UserRoundPlus className="size-4" aria-hidden />
            </button>
          ) : (
            <a
              href={exportHref}
              className={ICON_BUTTON}
              aria-label={`Guardar a ${request.name} en tus contactos`}
              title="Guardar en contactos"
            >
              <UserRoundPlus className="size-4" aria-hidden />
            </a>
          )}
          <button
            type="button"
            onClick={onDelete}
            className={cn(ICON_BUTTON, "hover:bg-danger/10 hover:text-danger")}
            aria-label={`Borrar el contacto de ${request.name}`}
            title="Borrar"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {request.email ? (
          <a href={contactEmailHref(request.email)} className="inline-flex min-w-0 items-center gap-1.5 text-signal-deep hover:underline">
            <Mail className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{request.email}</span>
          </a>
        ) : null}
        {request.phone ? (
          <a href={contactPhoneHref(request.phone)} className="inline-flex items-center gap-1.5 text-signal-deep hover:underline">
            <Phone className="size-3.5 shrink-0" aria-hidden />
            {request.phone}
          </a>
        ) : null}
      </div>
      {request.message ? (
        <p className="mt-2 line-clamp-3 rounded-xl bg-paper/70 px-3 py-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
          {request.message}
        </p>
      ) : null}
    </li>
  );
}

export function ContactsPanel({ requests, available, enabled, demo }: ContactsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [visible, removeOptimistic] = useOptimistic(requests, (list, id: string) => list.filter((r) => r.id !== id));
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const list = visible.filter((r) => !removed.has(r.id));
  const shown = expanded ? list : list.slice(0, COLLAPSED_COUNT);

  function remove(request: ContactRequest) {
    if (!window.confirm(`¿Borrar el contacto de ${request.name}? No se puede deshacer.`)) return;
    setError(null);
    if (demo) {
      setRemoved((prev) => new Set(prev).add(request.id));
      return;
    }
    startTransition(async () => {
      removeOptimistic(request.id);
      const result = await deleteContactRequestAction(request.id);
      if (result.ok) setRemoved((prev) => new Set(prev).add(request.id));
      else setError(result.error);
    });
  }

  if (!available) {
    return (
      <p className="text-sm text-muted">
        Falta un paso en la base de datos para recibir contactos (migración <code className="font-mono">20260929130000</code>).
      </p>
    );
  }

  return (
    <div id="contactos" className="scroll-mt-6">
      {list.length === 0 ? (
        <p className="text-sm text-muted">
          {enabled
            ? "Aún no te ha dejado nadie su contacto. Cuando pase, lo verás aquí (y te avisaremos por email si está configurado)."
            : "Activa «Deja que te dejen su contacto» en Publicación y quien vea tu tarjeta podrá dejarte el suyo."}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line/80">
            {shown.map((request) => (
              <ContactItem key={request.id} request={request} demo={demo} onDelete={() => remove(request)} />
            ))}
          </ul>
          {list.length > COLLAPSED_COUNT ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 text-sm font-medium text-signal-deep underline-offset-4 hover:underline"
            >
              {expanded ? "Ver menos" : `Ver los ${list.length}`}
            </button>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <ExportLink href="/dashboard/contactos?format=csv" demo={demo}>
              <Download className="size-4" aria-hidden /> Excel (CSV)
            </ExportLink>
            <ExportLink href="/dashboard/contactos?format=vcf" demo={demo}>
              <UserRoundPlus className="size-4" aria-hidden /> Todos a Contactos (.vcf)
            </ExportLink>
          </div>
        </>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <p className="mt-5 text-xs text-muted">
        Solo tú ves estos datos. Úsalos para lo que la persona aceptó: ponerte en contacto con ella.
      </p>
    </div>
  );
}
