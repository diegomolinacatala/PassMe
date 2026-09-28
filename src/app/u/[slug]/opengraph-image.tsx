import { ImageResponse } from "next/og";
import { BRAND, markSvg } from "@/lib/brand";
import { cardPalette, toHex } from "@/lib/card/colors";
import { getPublicCard } from "@/lib/data/cards";
import { loadOgFonts, OG_SIZE, SERIF } from "@/lib/og";
import { avatarForVCard, fetchAvatar } from "@/lib/pass/images";

export const alt = "Tarjeta de contacto en PassMe";
export const size = OG_SIZE;
export const contentType = "image/png";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""}`.toUpperCase();
}

/** Link preview for a shared card: accent stub with name, role and avatar. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [card, fonts] = await Promise.all([getPublicCard(slug), loadOgFonts()]);

  if (!card) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND.paper, fontFamily: SERIF, fontSize: 80, color: BRAND.ink }}>
          PassMe
        </div>
      ),
      { ...size, fonts },
    );
  }

  const palette = cardPalette(card.accentColor);
  const bg = toHex(palette.background);
  const fg = toHex(palette.foreground);
  const avatar = await fetchAvatar(card.avatarUrl);
  const avatarSrc = avatar ? `data:image/jpeg;base64,${await avatarForVCard(avatar)}` : null;
  const mark = `data:image/svg+xml;base64,${Buffer.from(markSvg({ foreground: fg, cutout: bg, size: 64 })).toString("base64")}`;
  const meta = [card.headline, card.company].filter(Boolean).join(" · ");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BRAND.paper, padding: 48, fontFamily: "Geist" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: bg,
            color: fg,
            borderRadius: 40,
            padding: "56px 64px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Geist Mono", fontSize: 22, letterSpacing: 4, opacity: 0.75 }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori renders <img> */}
            <img src={mark} width={34} height={34} />
            TARJETA DE CONTACTO
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40 }}>
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
              <div style={{ fontFamily: SERIF, fontSize: 108, lineHeight: 0.95, letterSpacing: -2 }}>{card.fullName}</div>
              {meta ? <div style={{ marginTop: 20, fontSize: 36, opacity: 0.85 }}>{meta}</div> : null}
            </div>
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori renders <img>
              <img src={avatarSrc} width={220} height={220} style={{ borderRadius: 999, border: `6px solid ${fg}33` }} />
            ) : (
              <div
                style={{
                  width: 220,
                  height: 220,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `${fg}1f`,
                  fontFamily: SERIF,
                  fontSize: 96,
                }}
              >
                {initials(card.fullName)}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
