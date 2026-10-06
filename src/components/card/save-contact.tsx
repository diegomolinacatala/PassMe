"use client";

import { Check, Download, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { announce } from "@/lib/announce";
import { useCardPage } from "./card-page-context";

interface SaveContactProps {
  /** The vCard route (counts the download under the visit's source). */
  href: string;
  /** "Alex Rivera.vcf": what the browser saves, so the visitor can find it. */
  fileName: string;
  firstName: string;
  /** iOS opens the vCard in its own "add contact" screen; elsewhere it's a file to open. */
  opensInline: boolean;
  /** "Crear mi tarjeta" after saving; null hides the invitation (the owner on their own card). */
  createHref: string | null;
  /** The card takes contact requests: "Déjale el tuyo" can open that form. */
  canLeaveContact: boolean;
}

/**
 * "Guardar contacto" that answers back. Outside iOS the vCard is a download
 * people often miss, so the card says which file to open and how; coming back
 * to the tab (or, on iOS, the tap itself) turns it into "Contacto guardado"
 * with an invitation to return the favor.
 */
export function SaveContact({ href, fileName, firstName, opensInline, createHref, canLeaveContact }: SaveContactProps) {
  const { saved, markSaved, sent, open } = useCardPage();
  const [downloading, setDownloading] = useState(false);

  // Opening the file (or the Contacts app) leaves the tab; coming back means it's done.
  useEffect(() => {
    if (!downloading || saved) return;
    let left = document.visibilityState === "hidden";
    const leave = () => {
      left = true;
    };
    const back = () => {
      if (left) markSaved();
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? leave() : back());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
    };
  }, [downloading, saved, markSaved]);

  function onClick() {
    if (opensInline) {
      markSaved();
      return;
    }
    setDownloading(true);
    announce(`Casi está. Abre ${fileName} para guardarlo en tus contactos.`);
  }

  const offerContact = canLeaveContact && !sent.contact && !sent.meeting;

  return (
    <div>
      {/* Plain link: the vCard route decides between the native sheet (iOS) and a download. */}
      <a href={href} onClick={onClick} className={buttonClasses({ variant: saved ? "outline" : "signal", size: "lg", className: "w-full" })}>
        {saved ? <Check className="size-5" aria-hidden /> : <UserRoundPlus className="size-5" aria-hidden />}
        {saved ? "Contacto guardado" : "Guardar contacto"}
      </a>

      {downloading && !saved ? <DownloadHelp href={href} fileName={fileName} /> : null}

      {saved && createHref ? (
        <p className="mt-3 animate-rise text-center text-body text-ink-soft">
          ¿Y tú?{" "}
          {offerContact ? (
            <>
              <button
                type="button"
                onClick={() => open("contact", { scroll: true })}
                className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4 hover:text-signal-deep"
              >
                Déjale el tuyo a {firstName}
              </button>
              <span aria-hidden="true"> · </span>
            </>
          ) : null}
          <Link href={createHref} className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4 hover:text-signal-deep">
            Crear mi tarjeta
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/** Where the file went: the name to look for and a drawing of the downloads bar with "Abrir". */
function DownloadHelp({ href, fileName }: { href: string; fileName: string }) {
  return (
    <div className="mt-3 animate-rise rounded-panel border hairline bg-paper px-4 pt-4 pb-2">
      <p className="text-body leading-snug text-ink-soft">
        Casi está. Abre <strong className="font-medium break-all text-ink">{fileName}</strong> para guardarlo en tus contactos.
      </p>
      {/* A sketch of the browser's downloads bar, not a control. */}
      <div aria-hidden="true" className="mt-3 flex items-center gap-3 rounded-xl bg-ink px-3.5 py-2.5 text-paper shadow-soft">
        <Download className="size-4 shrink-0 text-paper/70" />
        <span className="min-w-0 flex-1 truncate text-sm">{fileName}</span>
        <span className="shrink-0 rounded-full bg-glow px-3 py-1 text-sm font-medium text-ink ring-2 ring-signal ring-offset-2 ring-offset-ink">
          Abrir
        </span>
      </div>
      <a href={href} className="mt-1 inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 hover:text-ink">
        ¿No lo ves? Volver a descargar
      </a>
    </div>
  );
}
