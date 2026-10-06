"use client";

import { Download, Printer, X } from "lucide-react";
import { useId, useRef } from "react";
import { QrCode } from "@/components/card/qr-code";
import { buttonClasses } from "@/components/ui/button";

interface PrintQrDialogProps {
  slug: string;
  /** What the printed QR opens (?src=qr, so scans count as such). */
  qrUrl: string;
  /** Classes of the button that opens it, to sit with its neighbours. */
  triggerClassName: string;
}

/**
 * "QR para imprimir": a sheet with a preview and both downloads — SVG for
 * print shops and design apps, a 1024 px PNG for slides and documents.
 * A native <dialog>: focus stays inside, Escape closes it and focus returns.
 */
export function PrintQrDialog({ slug, qrUrl, triggerClassName }: PrintQrDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const base = `/u/${encodeURIComponent(slug)}/qr`;

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={triggerClassName}>
        <Printer className="size-4" aria-hidden /> QR para imprimir
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        // Clicking the backdrop (outside the panel) closes it, like a sheet.
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
        className="m-auto w-[min(92vw,26rem)] rounded-object bg-card p-0 text-ink shadow-object backdrop:bg-ink/55 backdrop:backdrop-blur-[2px] max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Para imprimir</p>
              <h2 id={titleId} className="mt-1 font-display text-3xl leading-none tracking-tight">
                Tu QR, <em className="text-signal">en papel.</em>
              </h2>
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
              aria-label="Cerrar"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="mx-auto mt-5 w-fit rounded-2xl border hairline bg-white p-3">
            <QrCode value={qrUrl} label="Vista previa del QR para imprimir" className="size-44 text-ink" quietZone={1} />
          </div>
          <p className="mt-3 text-center text-sm text-muted">Para tarjetas, acreditaciones o diapositivas. Lleva a tu tarjeta.</p>
          <div className="mt-5 grid gap-2.5">
            <a href={base} download className={buttonClasses({ variant: "ink", className: "w-full" })}>
              <Download className="size-4" aria-hidden /> Descargar SVG
            </a>
            <a href={`${base}?format=png`} download className={buttonClasses({ variant: "outline", className: "w-full" })}>
              <Download className="size-4" aria-hidden /> Descargar PNG (1024 px)
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
