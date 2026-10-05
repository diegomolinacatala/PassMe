"use client";

import { Check, Share } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { announce } from "@/lib/announce";

type TrackKind = "view" | "link_click";

function track(payload: { slug: string; kind: TrackKind; source?: string; linkId?: string }): void {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // fall through to fetch
  }
  void fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(
    () => undefined,
  );
}

/** First view of this card in this browser tab session? (Reloads don't count twice.) */
function isFirstViewThisSession(slug: string): boolean {
  const key = `passme:viewed:${slug}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    // Storage blocked (private mode, embedded browsers): count the view anyway.
  }
  return true;
}

/** Counts one view per card and session (skipped for the owner's editor preview). */
export function ViewTracker({ slug, source }: { slug: string; source: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (isFirstViewThisSession(slug)) track({ slug, kind: "view", source });
  }, [slug, source]);
  return null;
}

interface TrackedLinkProps {
  href: string;
  slug: string;
  linkId?: string;
  className?: string;
  children: ReactNode;
}

/** External/contact link that records a click without delaying navigation. */
export function TrackedLink({ href, slug, linkId, className, children }: TrackedLinkProps) {
  const isHttp = /^https?:/i.test(href);
  return (
    <a
      href={href}
      className={className}
      {...(isHttp ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
      onClick={() => {
        if (linkId) track({ slug, kind: "link_click", linkId });
      }}
    >
      {children}
    </a>
  );
}

export function ShareButton({ name, slug, disabled }: { name: string; slug: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/u/${encodeURIComponent(slug)}?src=share`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} · PassMe`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      announce("Enlace copiado");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={disabled}
      className={buttonClasses({ variant: "outline", size: "lg", className: "aspect-square px-0 disabled:opacity-100" })}
      aria-label={copied ? "Enlace copiado" : "Compartir tarjeta"}
      title={copied ? "Enlace copiado" : "Compartir"}
    >
      {copied ? <Check className="size-5" aria-hidden /> : <Share className="size-5" aria-hidden />}
    </button>
  );
}
