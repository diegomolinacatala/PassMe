"use client";

import { ArrowUpRight, LoaderCircle, Smartphone } from "lucide-react";
import { createContext, use, useState, useTransition } from "react";
import { createHandoffLinkAction } from "@/app/dashboard/actions";
import { QrCode } from "@/components/card/qr-code";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { ShareLinkButton } from "@/components/ui/share-link-button";
import { AddToWalletButton, passHref, QrShortcutButton } from "@/components/wallet/add-to-wallet-button";
import { cn } from "@/lib/cn";
import type { VisitSource } from "@/lib/env";
import { phoneWalletAction, type Platform } from "@/lib/platform";
import type { WalletAvailability } from "./wallet-panel";
import { WelcomeSendCard, type WelcomeReferrer } from "./welcome-send-card";

interface WelcomePanelProps {
  slug: string;
  fullName: string;
  /** Public URL as the QR carries it (?src=qr, so scans count as such). */
  qrUrl: string;
  /** Public URL to share (?src=share). */
  shareUrl: string;
  /** Whose card led here, if any. */
  referrer: WelcomeReferrer | null;
  /** How they reached it: scanned in person ("qr") or not. */
  via: VisitSource;
  /** What "Mandarle mi tarjeta" would send, or null when the card has no email or phone to send. */
  sendSummary: string | null;
  wallet: WalletAvailability;
  platform: Platform;
  demo: boolean;
}

const QUIET_LINK =
  "inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm text-paper/85 transition-colors hover:bg-paper/10 hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow";

/**
 * First thing a brand-new card sees. Met in person (scanned the QR): the QR,
 * big, to show back. Came from a link: "Mandarle mi tarjeta a Alex" first,
 * the QR second. Then this phone's one wallet button. A single way out:
 * "Personalizar mi tarjeta".
 */
/**
 * Lets the editor take over when the welcome closes: its title goes back to
 * being the page's H1 and gets the focus.
 */
export const WelcomeContext = createContext<{ onDismiss: () => void } | null>(null);

export function WelcomePanel(props: WelcomePanelProps) {
  const { slug, fullName, qrUrl, shareUrl, referrer, via, sendSummary, wallet, platform, demo } = props;
  const [open, setOpen] = useState(true);
  const context = use(WelcomeContext);
  const [handoff, setHandoff] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const firstName = fullName.split(/\s+/)[0] || fullName;
  const theirName = referrer?.name.split(/\s+/)[0] ?? null;
  const sendFirst = referrer !== null && via !== "qr";
  const query = demo ? "?demo=1" : "";
  const phoneWallet = phoneWalletAction(platform, wallet);
  // A computer gets every wallet that works (the pass is downloaded, then opened on the phone).
  const walletButtons =
    phoneWallet === "apple" || phoneWallet === "google"
      ? [phoneWallet]
      : phoneWallet === null
        ? (["apple", "google"] as const).filter((kind) => wallet[kind])
        : [];

  function dismiss() {
    setOpen(false);
    // Drop ?nueva=1 so a reload doesn't bring the welcome back.
    window.history.replaceState(null, "", "/dashboard");
    // The panel is gone: keep the keyboard (and screen reader) in the editor, not on <body>.
    if (context) context.onDismiss();
    else document.getElementById("editor-title")?.focus();
  }

  function openOnPhone() {
    setHandoffError(null);
    startTransition(async () => {
      const result = await createHandoffLinkAction();
      if (result.ok) setHandoff(result.url);
      else setHandoffError(result.error);
    });
  }

  const qrCaption = handoff
    ? "Escanéalo con tu móvil"
    : sendFirst
      ? "¿Estáis juntos? Enséñale este QR"
      : "Toca para ampliar";

  return (
    <section
      aria-labelledby="welcome-title"
      className={cn(
        "relative mb-10 grid animate-rise overflow-hidden rounded-object bg-ink px-5 py-7 text-paper shadow-object sm:px-10 sm:py-10",
        "[grid-template-areas:'title'_'send'_'qr'_'wallet'_'text'_'actions'] md:grid-cols-[auto_minmax(0,1fr)] md:gap-x-12",
        "md:[grid-template-areas:'qr_title'_'qr_send'_'qr_wallet'_'qr_text'_'qr_actions'] md:[grid-template-rows:repeat(4,auto)_1fr]",
      )}
    >
      <div className="[grid-area:title]">
        <p className="eyebrow text-paper/60">Tarjeta creada</p>
        <h1 id="welcome-title" className="mt-2 font-display text-[2.2rem] leading-[0.95] tracking-tight sm:text-5xl">
          Ya tienes tu tarjeta, <em className="text-glow">{firstName}.</em>
        </h1>
      </div>

      {sendFirst && referrer ? (
        <div className="mt-5 [grid-area:send]">
          <WelcomeSendCard referrer={referrer} via={via} summary={sendSummary} shareUrl={shareUrl} demo={demo} />
        </div>
      ) : null}

      <figure className="mx-auto mt-6 w-fit [grid-area:qr] md:mt-0 md:self-center">
        {handoff ? (
          <div className="mx-auto w-fit rounded-pass bg-white p-3">
            <QrCode value={handoff} label="QR para añadir el pase desde tu móvil" className="size-56 text-ink sm:size-60" quietZone={1} />
          </div>
        ) : (
          <a
            href="/dashboard/qr"
            className="mx-auto block w-fit rounded-pass bg-white p-3 shadow-object transition-transform duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
          >
            <QrCode
              value={qrUrl}
              label={`QR de la tarjeta de ${fullName}. Toca para verlo a pantalla completa`}
              className={cn("text-ink", sendFirst ? "size-40 sm:size-52" : "size-56 sm:size-60")}
              quietZone={1}
            />
          </a>
        )}
        <figcaption className="eyebrow mt-3 text-center text-glow">{qrCaption}</figcaption>
      </figure>

      {walletButtons.length > 0 || phoneWallet === "qr" ? (
        <div className="mt-5 grid justify-items-center gap-2.5 [grid-area:wallet] md:justify-items-start">
          {walletButtons.map((kind) => (
            <AddToWalletButton key={kind} wallet={kind} href={passHref(kind, query)} onDark />
          ))}
          {phoneWallet === "qr" ? <QrShortcutButton onDark /> : null}
        </div>
      ) : null}

      <div className="[grid-area:text]">
        {sendFirst ? null : (
          <p className="mt-5 max-w-md text-paper/80">
            {theirName
              ? `Enséñale este QR a ${theirName}: lo escanea con la cámara y tiene tu contacto al momento.`
              : "Enséñale este QR a quien quieras: lo escanea con la cámara y tiene tu contacto al momento."}
          </p>
        )}
        {platform === "other" && wallet.handoff && !demo && !handoff ? (
          <button
            type="button"
            onClick={openOnPhone}
            disabled={pending}
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-paper/80 underline-offset-4 hover:text-paper hover:underline disabled:opacity-60"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}
            ¿Estás en el ordenador? Añádela desde tu móvil
          </button>
        ) : null}
        {handoffError ? (
          <Notice tone="error" onDark className="mt-2">
            {handoffError}
          </Notice>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 [grid-area:actions] md:self-start">
        <button type="button" onClick={dismiss} className={buttonClasses({ variant: "paper", size: "md" })}>
          Personalizar mi tarjeta
        </button>
        <ShareLinkButton url={shareUrl} title={`${fullName} · PassMe`} className={QUIET_LINK} />
        <a href={`/u/${encodeURIComponent(slug)}`} target="_blank" rel="noopener" className={QUIET_LINK}>
          <ArrowUpRight className="size-4" aria-hidden /> Ver mi tarjeta
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
      </div>
    </section>
  );
}
