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

/**
 * QR rendered as a single SVG path from the module matrix — no innerHTML,
 * crisp at any size, works in server and client components.
 */
export function QrCode({ value, className, label, color = "currentColor", quietZone = 2 }: QrCodeProps) {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const view = size + quietZone * 2;

  let d = "";
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.modules.get(row, col)) d += `M${col + quietZone} ${row + quietZone}h1v1h-1z`;
    }
  }

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
