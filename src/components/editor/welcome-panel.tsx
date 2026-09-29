"use client";

import { Check, ExternalLink, LoaderCircle, Share, Smartphone, X } from "lucide-react";
import { useState, useTransition } from "react";
import { createHandoffLinkAction } from "@/app/dashboard/actions";
import { QrCode } from "@/components/card/qr-code";
import { AppleWalletGlyph, GoogleWalletGlyph } from "@/components/card/wallet-glyphs";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Platform } from "@/lib/platform";
import type { WalletAvailability } from "./wallet-panel";

interface WelcomePanelProps {
  slug: string;
  fullName: string;
  /** Public URL as the QR carries it (?src=qr, so scans count as such). */
  qrUrl: string;
  /** Public URL to share. */
  shareUrl: string;
  /** Full name of the person whose card led here, if any. */
  referrerName: string | null;
  wallet: WalletAvailability;
  platform: Platform;
  demo: boolean;
}

const WALLET_LINK =
  "flex h-13 items-center gap-3 rounded-2xl px-4 text-[0.95rem] font-medium transition-[background-color,transform] duration-200 active:translate-y-px";

/**
 * First thing a brand-new card sees: its QR, ready to show to whoever is in
 * front of you, and the one wallet button that fits this phone.
 */
export function WelcomePanel({ slug, fullName, qrUrl, shareUrl, referrerName, wallet, platform, demo }: WelcomePanelProps) {
  const [open, setOpen] = useState(true);
  const [shared, setShared] = useState(false);
  const [handoff, setHandoff] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const firstName = fullName.split(/\s+/)[0] || fullName;
  const theirName = referrerName?.split(/\s+/)[0] ?? null;
  const suffix = demo ? "?demo=1" : "";
  const showApple = wallet.apple && platform !== "android";
  const showGoogle = wallet.google && platform !== "ios";

  function dismiss() {
    setOpen(false);
    // Drop ?nueva=1 so a reload doesn't bring the welcome back.
    window.history.replaceState(null, "", "/dashboard");
  }

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${fullName} · PassMe`, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      // Share sheet dismissed.
    }
  }

  function openOnPhone() {
    setHandoffError(null);
    startTransition(async () => {
      const result = await createHandoffLinkAction();
      if (result.ok) setHandoff(result.url);
      else setHandoffError(result.error);
    });
  }

  return (
    <section
      aria-labelledby="welcome-title"
      className="relative mb-10 animate-rise overflow-hidden rounded-[30px] bg-ink px-5 py-7 text-paper shadow-object sm:px-10 sm:py-10"
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-4 right-4 grid size-9 place-items-center rounded-full text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper"
        aria-label="Cerrar la bienvenida"
      >
        <X className="size-5" aria-hidden />
      </button>

      <div className="grid items-center gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
        <figure className="mx-auto mt-6 w-fit md:mt-0">
          <div className="rounded-[22px] bg-white p-3 shadow-[0_20px_40px_-20px_rgb(0_0_0/0.6)]">
            <QrCode
              value={handoff ?? qrUrl}
              label={handoff ? "QR para añadir el pase desde tu móvil" : `QR de la tarjeta de ${fullName}`}
              className="size-56 text-ink sm:size-60"
              quietZone={1}
            />
          </div>
          <figcaption className="mt-3 text-center font-mono text-[11px] tracking-[0.14em] text-glow uppercase">
            {handoff ? "Escanéalo con tu móvil" : "Enséñalo: se escanea con la cámara"}
          </figcaption>
        </figure>

        <div>
          <p className="eyebrow text-paper/60">Tarjeta creada</p>
          <h2 id="welcome-title" className="mt-2 font-display text-[2.6rem] leading-[0.95] tracking-tight sm:text-5xl">
            Ya tienes tu tarjeta, <em className="text-glow">{firstName}.</em>
          </h2>
          <p className="mt-4 max-w-md text-paper/80">
            {theirName
              ? `Enséñale este QR a ${theirName}: lo escanea con la cámara y tiene tu contacto al momento.`
              : "Enséñale este QR a quien quieras: lo escanea con la cámara y tiene tu contacto al momento."}{" "}
            {showApple || showGoogle ? "Y para la próxima, llévala en la cartera del móvil." : null}
          </p>

          {showApple || showGoogle ? (
            <div className="mt-6 grid max-w-sm gap-2.5">
              {showApple ? (
                <a href={`/api/pass/apple${suffix}`} className={cn(WALLET_LINK, "bg-paper text-ink hover:bg-white")}>
                  <AppleWalletGlyph />
                  Añadir a Apple Wallet
                </a>
              ) : null}
              {showGoogle ? (
                <a
                  href={`/api/pass/google${suffix}`}
                  className={cn(WALLET_LINK, showApple ? "border border-paper/30 hover:bg-paper/10" : "bg-paper text-ink hover:bg-white")}
                >
                  <GoogleWalletGlyph />
                  Añadir a Google Wallet
                </a>
              ) : null}
            </div>
          ) : null}

          {platform === "other" && wallet.handoff && !demo && !handoff ? (
            <button
              type="button"
              onClick={openOnPhone}
              disabled={pending}
              className="mt-3 inline-flex items-center gap-2 text-sm text-paper/80 underline-offset-4 hover:text-paper hover:underline disabled:opacity-60"
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}
              ¿Estás en el ordenador? Añádela desde tu móvil
            </button>
          ) : null}
          {handoffError ? (
            <p role="alert" className="mt-2 text-sm text-glow">
              {handoffError}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button type="button" onClick={share} className={buttonClasses({ variant: "paper", size: "sm" })}>
              {shared ? <Check className="size-4" aria-hidden /> : <Share className="size-4" aria-hidden />}
              {shared ? "Enlace copiado" : "Compartir enlace"}
            </button>
            <a
              href={`/u/${encodeURIComponent(slug)}`}
              target="_blank"
              rel="noopener"
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm text-paper/85 transition-colors hover:bg-paper/10 hover:text-paper"
            >
              <ExternalLink className="size-4" aria-hidden /> Ver mi tarjeta
            </a>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex h-9 items-center rounded-full px-3.5 text-sm text-paper/85 transition-colors hover:bg-paper/10 hover:text-paper"
            >
              Personalizar: foto, colores y más ↓
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
