import { headers } from "next/headers";
import { ImageResponse } from "next/og";
import { initials } from "@/components/card/avatar";
import { PassArt, STRIP_BOX } from "@/components/card/pass-art";
import { BRAND, markSvg } from "@/lib/brand";
import { resolveDesign } from "@/lib/card/design";
import { lookupPublicCard } from "@/lib/data/cards";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { prettyProfileUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { loadOgFonts, OG_MONO, OG_SANS, OG_SIZE, SERIF } from "@/lib/og";
import { avatarForVCard, fetchAvatar } from "@/lib/pass/images";
import { cardUnavailableResponse, tooManyRequestsResponse } from "@/lib/pass/public-responses";
import { clientRateKey } from "@/lib/request";

export const alt = "Tarjeta de contacto en PassMe";
export const size = OG_SIZE;
export const contentType = "image/png";

const ART_WIDTH = 1040;
const ART_SCALE = ART_WIDTH / STRIP_BOX.width;
const ART_HEIGHT = Math.round(STRIP_BOX.height * ART_SCALE);

// A render (card lookup, photo download, Satori, PNG) is the priciest thing a public URL can
// trigger. Generous for link-preview crawlers, which share IPs, and a wall for loops.
const limiter = createSharedRateLimiter({ name: "og-ip", limit: 120, windowMs: 60_000 });

// ImageResponse defaults to "immutable, max-age=1 year" - wrong for a card whose name,
// photo and visibility change. Lowercase on purpose: it must replace the default key.
const CARD_CACHE = { "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" };
const NO_STORE = { "cache-control": "no-store" };

const markUri = (foreground: string, cutout: string) =>
  `data:image/svg+xml;base64,${Buffer.from(markSvg({ foreground, cutout, echo: BRAND.signal, size: 64 })).toString("base64")}`;

/** Link preview for a shared card: the pass artwork itself, on PassMe paper. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const rate = await limiter.check(clientRateKey(await headers()));
  if (!rate.ok) return tooManyRequestsResponse(rate.retryAfterSeconds);

  const { slug } = await params;
  const [lookup, fonts] = await Promise.all([lookupPublicCard(slug), loadOgFonts()]);
  // A database failure is not "no such card": don't hand crawlers a generic image to remember.
  if (lookup.status === "error") return cardUnavailableResponse();

  if (lookup.status === "missing") {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND.paper, fontFamily: SERIF, fontSize: 80, color: BRAND.ink }}>
          PassMe
        </div>
      ),
      { ...size, fonts, status: 404, headers: NO_STORE },
    );
  }

  const card = lookup.card;
  const avatar = await fetchAvatar(card.avatarUrl, { slug: card.slug });
  let avatarSrc: string | null = null;
  if (avatar) {
    try {
      avatarSrc = `data:image/jpeg;base64,${await avatarForVCard(avatar)}`;
    } catch (error) {
      // A photo that decodes for the header but not in full: the preview still goes out without it.
      log.warn("link preview photo conversion failed", { slug: card.slug }, error);
    }
  }
  const meta = [card.headline, card.company].filter(Boolean).join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BRAND.paper,
          padding: "44px 80px 48px",
          fontFamily: "Geist",
          color: BRAND.ink,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori renders <img> */}
            <img src={markUri(BRAND.ink, BRAND.paper)} width={40} height={40} />
            <div style={{ display: "flex", fontFamily: SERIF, fontSize: 36 }}>
              Pass<span style={{ fontStyle: "italic", color: BRAND.signal }}>Me</span>
            </div>
          </div>
          <div style={{ display: "flex", fontFamily: OG_MONO, fontSize: 18, letterSpacing: 4, color: "#6a5f55" }}>
            TARJETA DE CONTACTO
          </div>
        </div>

        <div style={{ display: "flex", width: ART_WIDTH, height: ART_HEIGHT, borderRadius: 36, overflow: "hidden" }}>
          <PassArt
            design={resolveDesign(card)}
            variant="strip"
            name={card.fullName}
            initials={initials(card.fullName)}
            avatarSrc={avatarSrc}
            unit={(points) => points * ART_SCALE}
            fonts={{ serif: SERIF, sans: OG_SANS }}
            pixelSize={{ width: ART_WIDTH, height: ART_HEIGHT }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 40 }}>
          <div style={{ display: "flex", fontSize: 30, color: "#463b33", maxWidth: 720 }}>{meta || card.fullName}</div>
          <div style={{ display: "flex", fontFamily: OG_MONO, fontSize: 20, color: "#a9421a" }}>{prettyProfileUrl(card.slug)}</div>
        </div>
      </div>
    ),
    { ...size, fonts, headers: CARD_CACHE },
  );
}
