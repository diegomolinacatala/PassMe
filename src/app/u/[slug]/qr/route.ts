import QRCode from "qrcode";
import type { NextRequest } from "next/server";
import { getPublicCard } from "@/lib/data/cards";
import { profileUrl } from "@/lib/env";

export const runtime = "nodejs";

/** Print-ready SVG QR of the public card (badges, paper cards, slides…). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/u/[slug]/qr">) {
  const { slug } = await ctx.params;
  const card = await getPublicCard(slug);
  if (!card) return new Response("Tarjeta no encontrada", { status: 404 });

  const svg = await QRCode.toString(profileUrl(card.slug, "qr"), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#141414", light: "#ffffff" },
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="passme-${card.slug}-qr.svg"`,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
