import { after, type NextRequest } from "next/server";
import { buildVCard, vcardFilename } from "@/lib/card/vcard";
import { getPublicCard, resolveSlugRedirect } from "@/lib/data/cards";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { recordEventBySlug } from "@/lib/data/events";
import { profileUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { avatarForVCard, fetchAvatar } from "@/lib/pass/images";
import { clientRateKey, isBot, parseVisitSource } from "@/lib/request";

export const runtime = "nodejs";

const limiter = createSharedRateLimiter({ name: "vcard-ip", limit: 30, windowMs: 60_000 });

/** "Guardar contacto": a vCard with only the links the owner made visible. */
export async function GET(request: NextRequest, ctx: RouteContext<"/u/[slug]/vcard">) {
  const rate = await limiter.check(clientRateKey(request.headers));
  if (!rate.ok) {
    return new Response("Demasiadas peticiones", { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  }

  const { slug } = await ctx.params;
  const card = await getPublicCard(slug);
  if (!card) {
    const current = await resolveSlugRedirect(slug);
    if (current) return Response.redirect(new URL(`/u/${current}/vcard${request.nextUrl.search}`, request.url), 307);
    return new Response("Tarjeta no encontrada", { status: 404 });
  }

  let photo = null;
  const avatar = await fetchAvatar(card.avatarUrl);
  if (avatar) {
    try {
      photo = { base64: await avatarForVCard(avatar), type: "JPEG" as const };
    } catch (error) {
      log.warn("vcard photo conversion failed", { slug }, error);
    }
  }

  const body = buildVCard(card, { profileUrl: profileUrl(card.slug), photo });
  // iOS Safari shows its native "add contact" sheet for inline vCards; other browsers
  // (Android Chrome would render text/* inline) get a download that opens Contacts.
  const isIos = /iPhone|iPad|iPod/i.test(request.headers.get("user-agent") ?? "");
  const disposition = isIos ? "inline" : "attachment";

  if (!isBot(request.headers.get("user-agent"))) {
    const source = parseVisitSource(request.nextUrl.searchParams.get("src"));
    after(() => recordEventBySlug(card.slug, { kind: "vcard", source }));
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `${disposition}; filename="${vcardFilename(card.slug)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
