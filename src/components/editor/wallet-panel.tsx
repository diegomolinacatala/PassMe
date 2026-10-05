"use client";

import { Check, Copy, Download, ExternalLink, LoaderCircle, Smartphone, Wallet } from "lucide-react";
import { useState, useTransition } from "react";
import { createHandoffLinkAction } from "@/app/dashboard/actions";
import { QrCode } from "@/components/card/qr-code";
import { AppleWalletGlyph, GoogleWalletGlyph } from "@/components/card/wallet-glyphs";
import { cn } from "@/lib/cn";

export interface WalletAvailability {
  apple: boolean;
  google: boolean;
  handoff: boolean;
}

interface WalletPanelProps {
  slug: string;
  profileUrl: string;
  availability: WalletAvailability;
  demo: boolean;
  /** Unsaved changes or missing name: passes would not match the editor. */
  blockedReason: string | null;
  isPublished: boolean;
}

export function WalletPanel({ slug, profileUrl, availability, demo, blockedReason, isPublished }: WalletPanelProps) {
  const [handoff, setHandoff] = useState<{ url: string; expiresAt: string } | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const suffix = demo ? "?demo=1" : "";
  const blocked = Boolean(blockedReason);

  function requestHandoff() {
    setHandoffError(null);
    startTransition(async () => {
      const result = await createHandoffLinkAction();
      if (result.ok) setHandoff({ url: result.url, expiresAt: result.expiresAt });
      else setHandoffError(result.error);
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const walletButton = (href: string, enabled: boolean, glyph: React.ReactNode, label: string, pendingLabel: string) =>
    enabled && !blocked ? (
      <a
        href={href}
        className="flex h-13 items-center gap-3 rounded-2xl bg-ink px-4 text-paper transition-[background-color,transform] duration-200 hover:bg-ink-soft active:translate-y-px"
      >
        {glyph}
        <span className="flex-1 text-[0.95rem] font-medium">{label}</span>
        <Wallet className="size-4 opacity-50" aria-hidden />
      </a>
    ) : (
      <div
        className="flex h-13 items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 text-muted"
        aria-disabled="true"
      >
        {glyph}
        <span className="flex-1 text-[0.95rem]">{label}</span>
        <span className="font-mono text-[10px] tracking-wider uppercase">{enabled ? "Guarda antes" : pendingLabel}</span>
      </div>
    );

  return (
    <div className="space-y-5">
      {blockedReason ? (
        <p className="rounded-xl bg-signal-wash px-3.5 py-2.5 text-sm text-signal-deep">{blockedReason}</p>
      ) : null}
      {!isPublished && !demo ? (
        <p className="rounded-xl bg-paper-deep px-3.5 py-2.5 text-sm text-ink-soft">
          Tu tarjeta está despublicada: el QR mostrará «tarjeta no encontrada» hasta que la vuelvas a publicar.
        </p>
      ) : null}

      <div className="grid gap-2.5">
        {walletButton(`/api/pass/apple${suffix}`, availability.apple, <AppleWalletGlyph />, "Añadir a Apple Wallet", "No disponible todavía")}
        {walletButton(`/api/pass/google${suffix}`, availability.google, <GoogleWalletGlyph />, "Añadir a Google Wallet", "No disponible todavía")}
      </div>

      {!demo && availability.handoff ? (
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
            <button
              type="button"
              onClick={requestHandoff}
              disabled={pending || blocked}
              className="flex w-full items-center gap-3 text-left disabled:opacity-50"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-paper-deep">
                {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Smartphone className="size-5" aria-hidden />}
              </span>
              <span className="flex-1">
                <span className="block text-[0.95rem] font-medium">¿Estás en el ordenador?</span>
                <span className="block text-sm text-muted">Genera un QR y ábrelo en tu móvil para añadir el pase.</span>
              </span>
            </button>
          )}
          {handoffError ? (
            <p className="mt-2 text-sm text-danger" role="alert">
              {handoffError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <a
          href={`/u/${encodeURIComponent(slug)}`}
          target="_blank"
          rel="noopener"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm transition-colors hover:border-ink"
        >
          <ExternalLink className="size-4" aria-hidden /> Ver mi tarjeta
        </a>
        <button
          type="button"
          onClick={copyLink}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm transition-colors hover:border-ink",
            copied && "border-ok text-ok",
          )}
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Enlace copiado" : "Copiar enlace"}
        </button>
        <a
          href={`/u/${encodeURIComponent(slug)}/qr`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm transition-colors hover:border-ink"
        >
          <Download className="size-4" aria-hidden /> QR para imprimir
        </a>
      </div>
    </div>
  );
}
