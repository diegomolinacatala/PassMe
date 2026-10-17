import QRCode from "qrcode";
import { cn } from "@/lib/cn";

interface QrCodeProps {
  value: string;
  className?: string;
  /** Accessible description, e.g. "Código QR de tu tarjeta". */
  label: string;
  color?: string;
  quietZone?: number;
}

interface QrPath {
  /** Modules per side (without the quiet zone). */
  size: number;
  d: string;
}

/** The landing renders the same URL four times per request; an editor preview redraws it on every keystroke. */
const cache = new Map<string, QrPath>();
const CACHE_LIMIT = 200;

/**
 * The module matrix as one SVG path: a rectangle per run of dark modules in a
 * row (about half the bytes of one square per module).
 */
function qrPath(value: string, quietZone: number): QrPath {
  const key = `${quietZone}|${value}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  let d = "";
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; ) {
      if (!qr.modules.get(row, col)) {
        col += 1;
        continue;
      }
      let end = col + 1;
      while (end < size && qr.modules.get(row, end)) end += 1;
      d += `M${col + quietZone} ${row + quietZone}h${end - col}v1h-${end - col}z`;
      col = end;
    }
  }

  if (cache.size >= CACHE_LIMIT) cache.clear();
  const path = { size, d };
  cache.set(key, path);
  return path;
}

/**
 * QR rendered as a single SVG path from the module matrix — no innerHTML,
 * crisp at any size, works in server and client components. Prefer rendering
 * it on the server and passing it down (WalletPass takes it as `qr`): the
 * qrcode library is about 34 KB that a phone then never has to download.
 */
export function QrCode({ value, className, label, color = "currentColor", quietZone = 2 }: QrCodeProps) {
  const { size, d } = qrPath(value, quietZone);
  const view = size + quietZone * 2;

  return (
    <svg
      viewBox={`0 0 ${view} ${view}`}
      className={cn("block", className)}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <path d={d} fill={color} />
    </svg>
  );
}
