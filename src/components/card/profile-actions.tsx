"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { NEW_TAB_SUFFIX, NewTabHint } from "@/components/ui/new-tab-hint";

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
  /** For icon-only links (e.g. the WhatsApp button next to a phone). */
  label?: string;
  children: ReactNode;
}

/** External/contact link that records a click without delaying navigation. */
export function TrackedLink({ href, slug, linkId, className, label, children }: TrackedLinkProps) {
  const isHttp = /^https?:/i.test(href);
  return (
    <a
      href={href}
      className={className}
      aria-label={label ? `${label}${isHttp ? NEW_TAB_SUFFIX : ""}` : undefined}
      title={label}
      {...(isHttp ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
      onClick={() => {
        if (linkId) track({ slug, kind: "link_click", linkId });
      }}
    >
      {children}
      {isHttp ? <NewTabHint /> : null}
    </a>
  );
}
