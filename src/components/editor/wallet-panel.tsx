"use client";

import { ArrowUpRight, ChevronDown, LoaderCircle, Smartphone } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { createHandoffLinkAction } from "@/app/dashboard/actions";
import { QrCode } from "@/components/card/qr-code";
import { ShareLinkButton } from "@/components/ui/share-link-button";
import { AddToWalletButton, GoogleWalletSoon, passHref, QrShortcutButton } from "@/components/wallet/add-to-wallet-button";
import { phoneWalletAction, type Platform } from "@/lib/platform";
import { PrintQrDialog } from "./print-qr-dialog";

export interface WalletAvailability {
  apple: boolean;
  /** Google Wallet configured *and* switched on (GOOGLE_WALLET_LIVE). */
  google: boolean;
  handoff: boolean;
}

interface WalletPanelProps {
  slug: string;
  /** Public URL to share (?src=share). */
  shareUrl: string;
  /** Public URL as the QR carries it (?src=qr). */
  qrUrl: string;
  availability: WalletAvailability;
  platform: Platform;
  demo: boolean;
  /** Unsaved changes or missing name: passes would not match the editor. */
  blockedReason: string | null;
  isPublished: boolean;
}

const PILL =
  "inline-flex h-11 items-center gap-1.5 rounded-full border border-line px-4 text-sm transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

/** A small disclosure ("¿Otro móvil?", "Descargar el archivo del pase") hiding the other wallets. */
function MoreWallets({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 grid gap-2.5">{children}</div>
    </details>
  );
}

/** "Escanéalo con tu móvil": a short-lived QR that opens "add to wallet" on the owner's phone. */
function Handoff({ blocked }: { blocked: boolean }) {
  const [handoff, setHandoff] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function request() {
    setError(null);
    startTransition(async () => {
      const result = await createHandoffLinkAction();
      if (result.ok) setHandoff({ url: result.url, expiresAt: result.expiresAt });
      else setError(result.error);
    });
  }

  return (
    <div className="rounded-2xl border hairline p-4">
      {handoff ? (
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-white p-2 shadow-soft">
            <QrCode value={handoff.url} label="QR para abrir tu pase en el móvil" className="size-28 text-black" quietZone={1} />
          </div>
          <div className="text-sm">
            <p className="font-medium">Escanéalo con tu móvil</p>
            <p className="mt-1 text-muted">
              Se abrirá la opción de añadir el pase. Caduca a las{" "}
              {new Date(handoff.expiresAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}.
            </p>
          </div>
        </div>
      ) : (
        <button type="button" onClick={request} disabled={pending || blocked} className="flex min-h-11 w-full items-center gap-3 text-left disabled:opacity-50">
          <span className="grid size-10 place-items-center rounded-xl bg-paper-deep">
            {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Smartphone className="size-5" aria-hidden />}
          </span>
          <span className="flex-1">
            <span className="block text-[0.95rem] font-medium">¿Estás en el ordenador?</span>
            <span className="block text-sm text-muted">Genera un QR, escanéalo con tu móvil y añade el pase desde ahí.</span>
          </span>
        </button>
      )}
      {error ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function WalletPanel({ slug, shareUrl, qrUrl, availability, platform, demo, blockedReason, isPublished }: WalletPanelProps) {
  const query = demo ? "?demo=1" : "";
  const blockedLabel = blockedReason ? "Guarda antes" : null;
  const apple = <AddToWalletButton wallet="apple" href={availability.apple ? passHref("apple", query) : null} blockedLabel={blockedLabel} />;
  const google = availability.google ? (
    <AddToWalletButton wallet="google" href={passHref("google", query)} blockedLabel={blockedLabel} />
  ) : (
    <GoogleWalletSoon />
  );
  const both = (
    <>
      {apple}
      {google}
    </>
  );

  const primary = phoneWalletAction(platform, availability);
  // "¿Otro móvil?": the wallets this phone isn't already showing.
  const others = (
    <>
      {primary !== "apple" ? apple : null}
      {primary === "apple" || (primary === "qr" && platform === "ios") ? google : null}
    </>
  );
  const showHandoff = platform === "other" && availability.handoff && !demo;

  return (
    <div className="space-y-5">
      {blockedReason ? <p className="rounded-xl bg-signal-wash px-3.5 py-2.5 text-sm text-signal-deep">{blockedReason}</p> : null}
      {!isPublished && !demo ? (
        <p className="rounded-xl bg-paper-deep px-3.5 py-2.5 text-sm text-ink-soft">
          Tu tarjeta está despublicada: el QR mostrará «tarjeta no encontrada» hasta que la vuelvas a publicar.
        </p>
      ) : null}

      {primary === null ? (
        // A computer: the pass is meant for the phone, so the handoff comes first.
        showHandoff ? (
          <div className="space-y-3">
            <Handoff blocked={Boolean(blockedReason)} />
            <MoreWallets summary="Descargar el archivo del pase">{both}</MoreWallets>
          </div>
        ) : (
          <div className="grid gap-2.5">{both}</div>
        )
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2.5">
            {primary === "apple" ? apple : null}
            {primary === "google" ? google : null}
            {primary === "qr" ? (
              <>
                <QrShortcutButton />
                <p className="text-sm text-muted">Ábrelo y añádelo a tu pantalla de inicio: tu QR, a un toque.</p>
                {platform === "android" ? <GoogleWalletSoon /> : null}
              </>
            ) : null}
          </div>
          <MoreWallets summary="¿Otro móvil?">{others}</MoreWallets>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <a href={`/u/${encodeURIComponent(slug)}`} target="_blank" rel="noopener" className={PILL}>
          <ArrowUpRight className="size-4" aria-hidden /> Ver mi tarjeta
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
        <ShareLinkButton url={shareUrl} className={PILL} />
        <PrintQrDialog slug={slug} qrUrl={qrUrl} triggerClassName={PILL} />
      </div>
    </div>
  );
}
