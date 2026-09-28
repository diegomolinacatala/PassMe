import { ImageResponse } from "next/og";
import { PatternSvg } from "@/components/card/pattern-svg";
import { BRAND, markSvg } from "@/lib/brand";
import { resolveDesign } from "@/lib/card/design";
import { loadOgFonts, OG_MONO, OG_SIZE, SERIF } from "@/lib/og";

export const alt = "PassMe — tu tarjeta de visita en la cartera del móvil";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Site link preview: warm paper, a Naranja guilloché seal and the promise. */
export default async function Image() {
  const mark = `data:image/svg+xml;base64,${Buffer.from(
    markSvg({ foreground: BRAND.ink, cutout: BRAND.paper, echo: BRAND.signal, size: 96 }),
  ).toString("base64")}`;
  const seal = { ...resolveDesign({ accentColor: BRAND.paper, detailColor: BRAND.signal, pattern: "sello", patternSeed: 48213 }), detail: BRAND.signal };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BRAND.paper,
          padding: "68px 80px",
          fontFamily: "Geist",
          color: BRAND.ink,
        }}
      >
        <PatternSvg
          design={seal}
          box={{ width: 1200, height: 630 }}
          focus={{ x: 1010, y: 300, r: 120 }}
          fade={{ from: 420, to: 940 }}
          width={1200}
          height={630}
          style={{ position: "absolute", left: 0, top: 0 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori renders <img> */}
          <img src={mark} width={64} height={64} />
          <div style={{ display: "flex", fontFamily: SERIF, fontSize: 52 }}>
            Pass<span style={{ fontStyle: "italic", color: BRAND.signal }}>Me</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexWrap: "wrap", maxWidth: 860, fontFamily: SERIF, fontSize: 108, lineHeight: 0.92, letterSpacing: -2 }}>
            <span>Tu tarjeta de visita,&nbsp;</span>
            <span style={{ fontStyle: "italic", color: BRAND.signal }}>en la cartera</span>
            <span>&nbsp;del móvil.</span>
          </div>
          <div style={{ display: "flex", marginTop: 36, fontFamily: OG_MONO, fontSize: 22, letterSpacing: 4, color: "#6a5f55" }}>
            PÁSAME TU CONTACTO · APPLE WALLET · GOOGLE WALLET
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await loadOgFonts() },
  );
}
