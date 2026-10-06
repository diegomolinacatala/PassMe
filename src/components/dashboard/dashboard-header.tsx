import { QrCode as QrCodeIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { AccountMenu } from "./account-menu";

interface DashboardHeaderProps {
  slug: string;
  name: string;
  shareUrl: string;
}

/**
 * Editor header: "Mi QR" always one tap away (the reason to come back), and
 * the account menu. "Mi QR" is a plain link so the editor's "unsaved changes"
 * warning still stops the navigation.
 */
export function DashboardHeader({ slug, name, shareUrl }: DashboardHeaderProps) {
  return (
    <header className="border-b hairline">
      <div className="mx-auto flex min-h-16 max-w-[1240px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 sm:px-8">
        <Logo href="/dashboard" />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a href="/dashboard/qr" className={buttonClasses({ variant: "ink", size: "md", className: "px-4" })}>
            <QrCodeIcon className="size-4" aria-hidden />
            Mi QR
          </a>
          <AccountMenu name={name} slug={slug} shareUrl={shareUrl} />
        </div>
      </div>
    </header>
  );
}
