"use client";

import { Check, Copy, Share, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { announce } from "@/lib/announce";
import { cn } from "@/lib/cn";
import { buttonClasses, type Size, type Variant } from "./button";

const subscribeNoop = () => () => {};

/** Web Share is there (phones, Safari, Chrome on Windows/macOS)? Assumed on the server. */
function useCanShare(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => true,
  );
}

const COPIED_MS = 2000;

interface ShareLinkButtonProps {
  url: string;
  /** Share sheet title, e.g. "Alex Rivera · PassMe". */
  title?: string;
  /** Share text instead of title + url (it should then contain the url). */
  text?: string;
  /** Visible labels: with the share sheet, and when it falls back to copying. */
  shareLabel?: string;
  copyLabel?: string;
  variant?: Variant;
  size?: Size;
  /** Replaces the button styling entirely (menu rows, dark panels…). */
  className?: string;
  /** Extra classes for the icon (e.g. a muted tone in menus). */
  iconClassName?: string;
  /** The share glyph people know on their phone: iOS's box with an arrow, or Android's three dots. */
  shareIcon?: "ios" | "android";
}

/**
 * "Compartir" with the phone's share sheet; where there's none, "Copiar enlace"
 * puts the link on the clipboard and says "Enlace copiado" (also to screen
 * readers, through the app's live region).
 */
export function ShareLinkButton({
  url,
  title,
  text,
  shareLabel = "Compartir",
  copyLabel = "Copiar enlace",
  variant = "outline",
  size = "md",
  className,
  iconClassName,
  shareIcon = "ios",
}: ShareLinkButtonProps) {
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      announce("Enlace copiado");
      window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      announce("No hemos podido copiar el enlace. Cópialo de la barra de direcciones.");
    }
  }

  async function share() {
    if (!canShare) return copy();
    try {
      await navigator.share(text ? { text } : { title, url });
    } catch (error) {
      // Dismissing the sheet is not a failure; anything else (blocked, unsupported data) falls back to copying.
      if (!(error instanceof DOMException && error.name === "AbortError")) await copy();
    }
  }

  const label = copied ? "Enlace copiado" : canShare ? shareLabel : copyLabel;
  const Icon = copied ? Check : canShare ? (shareIcon === "ios" ? Share : Share2) : Copy;

  return (
    <button type="button" onClick={share} className={className ?? cn(buttonClasses({ variant, size }), copied && "text-ok")}>
      <Icon className={cn("size-4", iconClassName)} aria-hidden />
      {label}
    </button>
  );
}
