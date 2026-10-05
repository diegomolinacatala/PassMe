import { QrCode as QrCodeIcon } from "lucide-react";
import { AppleWalletGlyph, GoogleWalletGlyph } from "@/components/card/wallet-glyphs";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type WalletKind = "apple" | "google";

const WALLETS: Record<WalletKind, { name: string; glyph: () => React.ReactNode }> = {
  apple: { name: "Apple Wallet", glyph: AppleWalletGlyph },
  google: { name: "Google Wallet", glyph: GoogleWalletGlyph },
};

/** Where each wallet's pass is downloaded from (the demo pass with ?demo=1, a handoff token with ?t=…). */
export function passHref(wallet: WalletKind, query = ""): string {
  return `/api/pass/${wallet}${query}`;
}

interface AddToWalletButtonProps {
  wallet: WalletKind;
  /** The pass download; null when this wallet can't be offered. */
  href: string | null;
  /** Shown instead of the link, e.g. "Guarda antes" while the editor has unsaved changes. */
  blockedLabel?: string | null;
  /** On a Café surface: a hairline keeps the black badge apart from it. */
  onDark?: boolean;
  className?: string;
}

const BADGE =
  "flex h-14 w-full max-w-[20rem] items-center gap-3 rounded-xl px-4 transition-[background-color,transform] duration-200 active:translate-y-px";

/**
 * The one "Añadir a … Wallet" button used everywhere (welcome, editor, /wallet):
 * black, like the badges Apple and Google ask for. Without a pass to offer it
 * becomes a quiet row saying why, never a dead link.
 */
export function AddToWalletButton({ wallet, href, blockedLabel, onDark = false, className }: AddToWalletButtonProps) {
  const { name, glyph: Glyph } = WALLETS[wallet];

  if (!href || blockedLabel) {
    return (
      <div
        aria-disabled="true"
        className={cn(BADGE, "border border-dashed", onDark ? "border-paper/30 text-paper/70" : "border-line-strong text-muted", className)}
      >
        <Glyph />
        <span className="flex-1 text-[0.95rem]">{name}</span>
        <span className="font-mono text-[11px] tracking-wider uppercase">{blockedLabel ?? "No disponible todavía"}</span>
      </div>
    );
  }

  return (
    <a
      href={href}
      className={cn(
        BADGE,
        "bg-black text-white hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
        onDark && "ring-1 ring-white/45",
        className,
      )}
    >
      <Glyph />
      <span className="flex flex-col leading-tight">
        <span className="text-xs text-white/80">Añadir a</span> <span className="text-lg font-semibold tracking-tight">{name}</span>
      </span>
    </a>
  );
}

/** Not a link: Google Wallet is coming once Google approves the issuer (GOOGLE_WALLET_LIVE). */
export function GoogleWalletSoon({ onDark = false }: { onDark?: boolean }) {
  return (
    <p className={cn(BADGE, "h-11 border border-dashed text-sm", onDark ? "border-paper/30 text-paper/70" : "border-line-strong text-muted")}>
      <GoogleWalletGlyph />
      Google Wallet · muy pronto
    </p>
  );
}

/**
 * What a phone without a wallet pass gets instead: the full-screen QR, which
 * can be pinned to the home screen. A plain <a> so the editor's "unsaved
 * changes" warning still applies.
 */
export function QrShortcutButton({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <a
      href="/dashboard/qr"
      className={buttonClasses({ variant: onDark ? "paper" : "ink", size: "lg", className: cn("w-full max-w-[20rem] px-5 whitespace-normal", className) })}
    >
      <QrCodeIcon className="size-5" aria-hidden />
      Guardar mi QR en el móvil
    </a>
  );
}
