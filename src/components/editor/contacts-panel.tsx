"use client";

import { Download, Mail, Phone, Trash2, UserRoundPlus } from "lucide-react";
import { useEffect, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { deleteContactRequestAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/field";
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
  "grid size-11 sm:size-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:pointer-events-none";
const EXPORT_BUTTON =
  "inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 rounded-full border border-ink/80 px-3.5 text-sm font-medium transition-colors hover:bg-ink hover:text-paper disabled:pointer-events-none disabled:opacity-40";

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

interface ContactItemProps {
  request: ContactRequest;
  demo: boolean;
  /** The inline "¿Borrar…?" is open for this contact. */
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}

/**
 * Someone else's data, gone for good: deleting asks once, in place, with
 * "Borrar" and "No borrar" (the safe one gets the focus).
 */
function DeleteConfirm({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <div role="group" aria-label={`Borrar el contacto de ${name}`} className="mt-3 rounded-2xl bg-danger-wash px-4 py-3">
      <p className="text-sm text-danger">¿Borrar el contacto de {name}? No se puede deshacer.</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button variant="danger" size="sm" onClick={onConfirm}>
          <Trash2 className="size-4" aria-hidden />
          Borrar
        </Button>
        <Button ref={keep} variant="ghost" size="sm" onClick={onCancel}>
          No borrar
        </Button>
      </div>
    </div>
  );
}

function ContactItem({ request, demo, confirming, onAskDelete, onCancelDelete, onDelete }: ContactItemProps) {
  const exportHref = `/dashboard/contactos?format=vcf&id=${encodeURIComponent(request.id)}`;
  const trash = useRef<HTMLButtonElement>(null);
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
            ref={trash}
            type="button"
            onClick={onAskDelete}
            aria-expanded={confirming}
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
      {confirming ? (
        <DeleteConfirm
          name={request.name}
          onConfirm={onDelete}
          onCancel={() => {
            onCancelDelete();
            requestAnimationFrame(() => trash.current?.focus());
          }}
        />
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
  const [confirming, setConfirming] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = visible.filter((r) => !removed.has(r.id));
  const shown = expanded ? list : list.slice(0, COLLAPSED_COUNT);

  function remove(request: ContactRequest) {
    setConfirming(null);
    setError(null);
    // The row is going away: keep the keyboard in the panel, not on <body>.
    requestAnimationFrame(() => panel.current?.focus());
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

  if (!available) return <p className="text-sm text-muted">Esta función aún no está disponible.</p>;

  return (
    <div id="contactos" ref={panel} tabIndex={-1} className="scroll-mt-6 outline-none">
      {list.length === 0 ? (
        <p className="text-sm text-muted">
          {enabled
            ? "Aún no te ha dejado nadie su contacto. Cuando alguien te lo deje, te avisaremos por email y lo verás aquí."
            : "Activa «Recibir contactos» en Publicación y quien vea tu tarjeta podrá dejarte el suyo."}
        </p>
      ) : (
        <>
          <p className="-mt-3 mb-4 text-sm text-muted">{list.length === 1 ? "1 en total" : `${list.length} en total`}</p>
          <ul className="divide-y divide-line/80">
            {shown.map((request) => (
              <ContactItem
                key={request.id}
                request={request}
                demo={demo}
                confirming={confirming === request.id}
                onAskDelete={() => setConfirming(request.id)}
                onCancelDelete={() => setConfirming(null)}
                onDelete={() => remove(request)}
              />
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
              <Download className="size-4" aria-hidden /> Descargar para Excel
            </ExportLink>
            <ExportLink href="/dashboard/contactos?format=vcf" demo={demo}>
              <UserRoundPlus className="size-4" aria-hidden /> Guardar todos en Contactos
            </ExportLink>
          </div>
        </>
      )}
      {error ? (
        <InlineError live className="mt-3">
          {error}
        </InlineError>
      ) : null}
      <p className="mt-5 text-xs text-muted">
        Solo tú ves estos datos. Úsalos para lo que la persona aceptó: ponerte en contacto con ella.
      </p>
    </div>
  );
}
