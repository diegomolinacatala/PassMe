"use client";

import { useId, useRef } from "react";
import { buttonClasses } from "@/components/ui/button";
import { SwitchRow } from "./fields";

interface PublishSwitchProps {
  checked: boolean;
  /** Whether the saved card is published: only unpublishing a live card asks first. */
  savedPublished: boolean;
  onChange: (published: boolean) => void;
  className?: string;
}

/**
 * «Tarjeta publicada». Turning a live card off asks first: printed QRs stop
 * working and the wallet pass goes on pause. A native modal <dialog> keeps
 * focus inside, Escape cancels, and focus returns to the switch on close.
 */
export function PublishSwitch({ checked, savedPublished, onChange, className }: PublishSwitchProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  return (
    <>
      <SwitchRow
        checked={checked}
        onChange={(next) => {
          if (!next && savedPublished) dialog.current?.showModal();
          else onChange(next);
        }}
        label="Tarjeta publicada"
        description={
          checked
            ? "Tu tarjeta es visible para quien tenga el enlace o escanee tu QR."
            : "Despublicada: quien abra tu enlace o escanee tu QR verá que no está disponible, y tu pase queda en pausa."
        }
        className={className}
      />
      <dialog
        ref={dialog}
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
        className="m-auto w-[min(92vw,28rem)] rounded-object bg-card p-0 text-ink shadow-object backdrop:bg-ink/55 backdrop:backdrop-blur-[2px] max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
      >
        <div className="p-6">
          <h2 id={titleId} className="font-display text-3xl leading-none tracking-tight">
            ¿Despublicar tu tarjeta?
          </h2>
          <p id={bodyId} className="mt-3 leading-relaxed text-ink-soft">
            Quien escanee tu QR (también los impresos) verá que no está disponible y tu pase quedará en pausa. Puedes
            volver a publicarla cuando quieras.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            {/* The safe option gets the focus. */}
            <button
              type="button"
              autoFocus
              onClick={() => dialog.current?.close()}
              className={buttonClasses({ variant: "outline", className: "w-full sm:w-auto" })}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(false);
                dialog.current?.close();
              }}
              className={buttonClasses({ variant: "ink", className: "w-full sm:w-auto" })}
            >
              Despublicar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
