import { ArrowUpRight } from "lucide-react";
import { ShareLinkButton } from "@/components/ui/share-link-button";
import { AddToWalletButton, passHref, QrShortcutButton } from "@/components/wallet/add-to-wallet-button";
import { phoneWalletAction, type Platform } from "@/lib/platform";
import type { WalletAvailability } from "./wallet-panel";

interface QuickActionsProps {
  slug: string;
  fullName: string;
  shareUrl: string;
  platform: Platform;
  availability: WalletAvailability;
  demo: boolean;
  /** The pass would not match the editor yet ("Guarda antes"). */
  blocked: boolean;
  /** Unsaved changes: the public card doesn't show them yet. */
  dirty: boolean;
}

const PILL =
  "inline-flex min-h-11 max-w-full flex-wrap items-center gap-x-1.5 rounded-full border border-line bg-card/70 px-4 py-1.5 text-sm transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

/**
 * On phones, right under the editor's title: this phone's one wallet button
 * (or the full-screen QR), sharing and the public card — without scrolling
 * past eleven screens of form. Desktop has the same in its side column.
 */
export function QuickActions({ slug, fullName, shareUrl, platform, availability, demo, blocked, dirty }: QuickActionsProps) {
  const wallet = phoneWalletAction(platform, availability);
  const query = demo ? "?demo=1" : "";
  const blockedLabel = blocked ? "Guarda antes" : null;

  return (
    <div className="mb-6 space-y-3 lg:hidden">
      {wallet === "apple" || wallet === "google" ? (
        <AddToWalletButton wallet={wallet} href={passHref(wallet, query)} blockedLabel={blockedLabel} />
      ) : null}
      {wallet === "qr" ? <QrShortcutButton /> : null}
      <div className="flex flex-wrap gap-2">
        <ShareLinkButton url={shareUrl} title={`${fullName} · PassMe`} className={PILL} />
        <a href={`/u/${encodeURIComponent(slug)}`} target="_blank" rel="noopener" className={PILL}>
          <ArrowUpRight className="size-4" aria-hidden />
          Ver mi tarjeta
          {dirty ? <span className="text-muted">(sin tus cambios)</span> : null}
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
      </div>
    </div>
  );
}
