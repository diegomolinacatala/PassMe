"use client";

import { ArrowUpRight, LogOut, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ShareLinkButton } from "@/components/ui/share-link-button";
import { cn } from "@/lib/cn";

interface AccountMenuProps {
  /** Saved name, for the initials on the button. */
  name: string;
  slug: string;
  /** Public URL to share (?src=share). */
  shareUrl: string;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]![0], words.at(-1)![0]] : [words[0]?.[0]];
  return letters.filter(Boolean).join("").toUpperCase();
}

const ITEM =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-body text-ink transition-colors hover:bg-ink/[0.05] focus-visible:bg-ink/[0.05] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal";

/**
 * The owner's initials in the editor header, opening a small menu: their card,
 * sharing it, the account section and signing out — two taps from anywhere.
 * A disclosure (button + panel), not an ARIA menu: Tab moves through it,
 * Escape or a tap outside closes it and the focus goes back to the button.
 */
export function AccountMenu({ name, slug, shareUrl }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    }
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const letters = initials(name);

  return (
    <div
      ref={root}
      className="relative"
      // Tabbing out of the menu closes it, so it never lingers over the page. (No relatedTarget:
      // a click that focuses nothing, e.g. in Safari; the outside-tap listener handles those.)
      onBlur={(e) => {
        if (open && e.relatedTarget && !root.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "grid size-11 place-items-center rounded-full border border-ink/15 bg-card font-mono text-small font-medium tracking-wider text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
          open && "border-ink bg-ink text-paper",
        )}
      >
        {letters ? <span aria-hidden>{letters}</span> : <UserRound className="size-5" aria-hidden />}
        <span className="sr-only">Tu cuenta</span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute top-full right-0 z-40 mt-2 w-[min(17rem,calc(100vw-2rem))] rounded-2xl border hairline bg-card p-1.5 shadow-object"
      >
        <a href={`/u/${encodeURIComponent(slug)}`} target="_blank" rel="noopener" className={ITEM} onClick={() => setOpen(false)}>
          <ArrowUpRight className="size-4 text-muted" aria-hidden /> Ver mi tarjeta
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
        <ShareLinkButton url={shareUrl} title={`${name} · PassMe`} className={ITEM} iconClassName="text-muted" />
        <a href="#cuenta" className={ITEM} onClick={() => setOpen(false)}>
          <UserRound className="size-4 text-muted" aria-hidden /> Cuenta y privacidad
        </a>
        <div className="mx-3 my-1.5 border-t hairline" />
        <form action="/auth/signout" method="post">
          <button type="submit" className={ITEM}>
            <LogOut className="size-4 text-muted" aria-hidden /> Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
