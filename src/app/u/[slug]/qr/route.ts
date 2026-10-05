import QRCode from "qrcode";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { getPublicCard } from "@/lib/data/cards";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { profileUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { clientRateKey } from "@/lib/request";

export const runtime = "nodejs";

/** Side of the PNG version (?format=png): enough for a poster or a slide. */
const PNG_SIZE = 1024;
// Rasterizing is the pricier variant; a person downloads it once or twice.
const pngLimiter = createSharedRateLimiter({ name: "qr-png-ip", limit: 30, windowMs: 60_000 });

const QR_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 2,
  color: { dark: "#221b17", light: "#ffffff" },
} as const;

const COMMON_HEADERS = {
  "Cache-Control": "public, max-age=300",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
};

/** Print-ready QR of the public card (badges, paper cards, slides…): SVG, or a 1024 px PNG. */
export async function GET(request: NextRequest, ctx: RouteContext<"/u/[slug]/qr">) {
  const { slug } = await ctx.params;
  const card = await getPublicCard(slug);
  if (!card) return new Response("Tarjeta no encontrada", { status: 404 });

  const asPng = request.nextUrl.searchParams.get("format") === "png";
  if (asPng) {
    const rate = await pngLimiter.check(clientRateKey(request.headers));
    if (!rate.ok) {
      return new Response("Demasiadas peticiones", { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    }
  }
  // Drawn at the final size so every module lands on whole pixels.
  const svg = await QRCode.toString(profileUrl(card.slug, "qr"), {
    type: "svg",
    ...QR_OPTIONS,
    ...(asPng ? { width: PNG_SIZE } : {}),
  });

  if (!asPng) {
    return new Response(svg, {
      headers: {
        ...COMMON_HEADERS,
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="passme-${card.slug}-qr.svg"`,
      },
    });
  }

  try {
    const png = await sharp(Buffer.from(svg)).resize(PNG_SIZE, PNG_SIZE, { kernel: "nearest" }).png().toBuffer();
    return new Response(new Uint8Array(png), {
      headers: {
        ...COMMON_HEADERS,
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="passme-${card.slug}-qr.png"`,
      },
    });
  } catch (error) {
    log.error("qr png failed", { slug: card.slug }, error);
    return new Response("No se pudo generar la imagen", { status: 500 });
  }
}
