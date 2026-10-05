"use client";

import { Download, LogOut, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteAccountAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { INPUT_CLASSES } from "./fields";

interface AccountPanelProps {
  email: string | null;
  demo: boolean;
  /** Offer to download the contacts people left before they're gone. */
  hasContacts: boolean;
}

export function AccountPanel({ email, demo, hasContacts }: AccountPanelProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction(confirmation);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div id="cuenta" className="scroll-mt-6 space-y-4 text-sm">
      {email ? (
        <p className="text-muted">
          Sesión iniciada como <span className="font-medium text-ink">{email}</span>
        </p>
      ) : null}

      {!demo ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm" className="h-11 px-4">
              <LogOut className="size-4" aria-hidden /> Cerrar sesión
            </Button>
          </form>
          {/* Lost phone, shared computer: every session ends, not only this one. */}
          <form action="/auth/signout" method="post">
            <input type="hidden" name="scope" value="global" />
            <button type="submit" className="min-h-11 text-ink-soft underline underline-offset-4 hover:text-ink">
              Cerrar sesión en todos mis dispositivos
            </button>
          </form>
        </div>
      ) : null}

      <div className="rounded-2xl border border-danger/25 p-4">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={demo}
            className="inline-flex min-h-11 items-center gap-2 font-medium text-danger disabled:opacity-40"
          >
            <TriangleAlert className="size-4" aria-hidden /> Borrar mi cuenta y mi tarjeta
          </button>
        ) : (
          <div className="space-y-3">
            <p className="font-medium text-danger">Esto no se puede deshacer.</p>
            <p className="text-muted">
              Borraremos tu tarjeta, tu foto, tus estadísticas, los contactos que te han dejado y tus reuniones. Tu enlace dejará
              de funcionar y quedará reservado 90 días. El pase que tengas en la cartera dejará de actualizarse: quítalo desde la
              app Cartera.
            </p>
            {hasContacts ? (
              <a
                href="/dashboard/contactos?format=csv"
                className="inline-flex min-h-11 items-center gap-1.5 font-medium text-signal-deep underline-offset-4 hover:underline"
              >
                <Download className="size-4" aria-hidden /> Descargar mis contactos antes
              </a>
            ) : null}
            <p className="text-muted">
              Escribe <strong className="font-mono text-ink">BORRAR</strong> para confirmar.
            </p>
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              aria-label="Escribe BORRAR para confirmar"
              autoComplete="off"
              className={`${INPUT_CLASSES} h-10 font-mono`}
            />
            {error ? (
              <p className="text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={remove}
                disabled={pending || confirmation.trim().toUpperCase() !== "BORRAR"}
              >
                {pending ? "Borrando…" : "Borrar mi cuenta"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                No borrar
              </Button>
            </div>
          </div>
        )}
        {demo ? <p className="mt-2 text-muted">En la demo no se puede borrar la cuenta.</p> : null}
      </div>
    </div>
  );
}
