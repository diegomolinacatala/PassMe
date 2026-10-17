import { profileUrl } from "@/lib/env";
import { QrCode } from "./qr-code";

/**
 * The QR inside <WalletPass>, drawn on the server. Render it in a server
 * component and pass it down as `qr`: <WalletPass> is also used by client
 * components, and importing this file from one would put the qrcode library
 * back into the browser bundle.
 */
export function PassQr({ slug }: { slug: string }) {
  return <QrCode value={profileUrl(slug, "qr")} label="Código QR de la tarjeta" className="size-[112px] text-ink" quietZone={1} />;
}
