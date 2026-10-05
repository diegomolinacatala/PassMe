"use client";

import { Smartphone, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

const DISMISSED_KEY = "passme:home-hint-dismissed";
const subscribeNoop = () => () => {};

/** Dismissed before in this browser, or already running from the home screen (older iOS). */
function isHidden(): boolean {
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    // Storage blocked: show it; dismissing then lasts for this visit only.
    return false;
  }
}

/**
 * "Añádela a tu pantalla de inicio…" under the QR: the manifest opens this very
 * screen, so it's the phone's shortcut to the QR. Dismissed once, remembered
 * in this browser. Its slot is reserved from the first paint, so the QR above
 * never moves when the hint goes; opened from the home screen, there's no slot.
 */
export function HomeScreenHint({ text }: { text: string }) {
  const hidden = useSyncExternalStore(subscribeNoop, isHidden, () => false);
  const [dismissed, setDismissed] = useState(false);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Not remembered: it comes back next time, which is harmless.
    }
  }

  return (
    <div className="min-h-[4.5rem] w-full max-w-sm [@media(display-mode:standalone)]:hidden">
      {hidden || dismissed ? null : (
        <div role="note" className="flex items-start gap-3 rounded-2xl bg-paper px-4 py-3 text-left text-sm text-ink-soft">
          <Smartphone className="mt-0.5 size-4 shrink-0 text-signal-deep" aria-hidden />
          <p className="flex-1">{text}</p>
          <button
            type="button"
            onClick={dismiss}
            className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
            aria-label="Entendido, no volver a mostrar"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
