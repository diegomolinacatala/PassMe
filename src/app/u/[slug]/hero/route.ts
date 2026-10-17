import type { NextRequest } from "next/server";
import { lookupPublicCard } from "@/lib/data/cards";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { log } from "@/lib/log";
import { artVersion, heroImage } from "@/lib/pass/art";
import { cardUnavailableResponse, tooManyRequestsResponse } from "@/lib/pass/public-responses";
import { clientRateKey } from "@/lib/request";

export const runtime = "nodejs";

// Renders are memoized, but a first render is the priciest thing a public URL
// can trigger. Generous enough for Google's image fetchers, which share IPs.
const limiter = createSharedRateLimiter({ name: "hero-ip", limit: 120, windowMs: 60_000 });

/**
 * Google Wallet hero image for a published card: the pattern + seal artwork
 * without text. Google fetches it from the URL in the pass object, which
 * carries `?v=<artwork version>` so edits bust Google's image cache.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/u/[slug]/hero">) {
  const rate = await limiter.check(clientRateKey(request.headers));
  if (!rate.ok) return tooManyRequestsResponse(rate.retryAfterSeconds);

  const { slug } = await ctx.params;
  const lookup = await lookupPublicCard(slug);
  if (lookup.status === "error") return cardUnavailableResponse();
  if (lookup.status === "missing") return new Response("Tarjeta no encontrada", { status: 404, headers: { "Cache-Control": "no-store" } });
  const card = lookup.card;

  try {
    const png = await heroImage(card);
    // `v` is a prefix of the SHA-256 of the artwork inputs: only the exact current one earns a year-long cache.
    const isCurrent = request.nextUrl.searchParams.get("v") === artVersion(card, "hero");
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // Versioned URLs never change; unversioned ones may after an edit.
        "Cache-Control": isCurrent ? "public, max-age=31536000, immutable" : "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    log.error("hero image failed", { slug: card.slug }, error);
    return new Response("No se pudo generar la imagen", { status: 500 });
  }
}
