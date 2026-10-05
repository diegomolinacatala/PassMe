"use client";

import { CircleCheck, LoaderCircle, Send } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendMyCardAction } from "@/app/dashboard/actions";
import { buttonClasses } from "@/components/ui/button";
import { ShareLinkButton } from "@/components/ui/share-link-button";
import type { VisitSource } from "@/lib/env";

export interface WelcomeReferrer {
  slug: string;
  /** Full name of the person whose card led here. */
  name: string;
  /** Their card takes contacts ("Recibir contactos"): the card can be sent with one tap. */
  acceptsContacts: boolean;
}

interface WelcomeSendCardProps {
  referrer: WelcomeReferrer;
  via: VisitSource;
  /** "Alex verá tu nombre y tu email." — null when the card has nothing to send (no email or phone shown). */
  summary: string | null;
  /** The new card's link (?src=share), for sharing it by other means. */
  shareUrl: string;
  demo: boolean;
}

/** Confirmation that takes the focus (the button it replaces is gone). */
function Sent({ firstName, demo }: { firstName: string; demo: boolean }) {
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl bg-paper/10 px-4 py-3.5">
      <CircleCheck className="mt-0.5 size-5 shrink-0 text-glow" aria-hidden />
      <div>
        <p ref={heading} tabIndex={-1} className="font-medium outline-none">
          {firstName} ya tiene tu tarjeta.
        </p>
        <p className="mt-0.5 text-sm text-paper/75">
          {demo ? "Es la demo: esta vez no se ha enviado nada." : "La verá en sus contactos recibidos de PassMe."}
        </p>
      </div>
    </div>
  );
}

/**
 * "Mandarle mi tarjeta a Alex": for someone who reached Alex's card by a link
 * (not by scanning it in front of Alex), the quickest way back is to leave
 * their details on it. Cards that don't take contacts get the share sheet.
 */
export function WelcomeSendCard({ referrer, via, summary, shareUrl, demo }: WelcomeSendCardProps) {
  const firstName = referrer.name.split(/\s+/)[0] || referrer.name;
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareInstead, setShareInstead] = useState(!referrer.acceptsContacts || summary === null);
  const [pending, startTransition] = useTransition();

  if (sent) return <Sent firstName={firstName} demo={demo} />;

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendMyCardAction(referrer.slug, via);
      if (result.ok) {
        setSent(true);
        return;
      }
      setError(result.error);
      if (result.shareInstead) setShareInstead(true);
    });
  }

  return (
    <div className="max-w-sm">
      {shareInstead ? (
        <ShareLinkButton
          url={shareUrl}
          text={`Esta es mi tarjeta: ${shareUrl}`}
          shareLabel="Mandarle mi tarjeta por WhatsApp…"
          copyLabel="Copiar el enlace de mi tarjeta"
          className={buttonClasses({ variant: "signal", size: "lg", className: "w-full px-5" })}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={send}
            disabled={pending}
            aria-busy={pending}
            className={buttonClasses({ variant: "signal", size: "lg", className: "w-full px-5" })}
          >
            {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Send className="size-5" aria-hidden />}
            {pending ? "Mandándosela…" : `Mandarle mi tarjeta a ${firstName}`}
          </button>
          {summary ? <p className="mt-2 text-center text-sm text-paper/70">{summary}</p> : null}
        </>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-paper">
          {error}
        </p>
      ) : null}
    </div>
  );
}
