"use client";

import { LogOut, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteAccountAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { INPUT_CLASSES } from "./fields";

export function AccountPanel({ email, demo }: { email: string | null; demo: boolean }) {
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
    <div className="space-y-4 text-sm">
      {email ? (
        <p className="text-muted">
          Sesión iniciada como <span className="font-medium text-ink">{email}</span>
        </p>
      ) : null}

      {!demo ? (
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="outline" size="sm">
            <LogOut className="size-4" aria-hidden /> Cerrar sesión
          </Button>
        </form>
      ) : null}

      <div className="rounded-2xl border border-danger/25 p-4">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={demo}
            className="inline-flex items-center gap-2 font-medium text-danger disabled:opacity-40"
          >
            <TriangleAlert className="size-4" aria-hidden /> Eliminar mi cuenta y mi tarjeta
          </button>
        ) : (
          <div className="space-y-3">
            <p className="font-medium text-danger">Esto no se puede deshacer.</p>
            <p className="text-muted">
              Borraremos tu tarjeta, tu foto y tus estadísticas. Los pases que ya estén en carteras dejarán de funcionar.
              Escribe <strong className="font-mono text-ink">BORRAR</strong> para confirmar.
            </p>
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              aria-label="Confirmación"
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
                {pending ? "Borrando…" : "Eliminar definitivamente"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
