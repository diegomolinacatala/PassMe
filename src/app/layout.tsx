import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { connection } from "next/server";
import { LIVE_REGION_ID } from "@/lib/announce";
import { isGoogleWalletLive } from "@/lib/config.server";
import { getSiteUrl } from "@/lib/env";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      // Google Wallet is only promised once people can actually add the pass (GOOGLE_WALLET_LIVE).
      default: isGoogleWalletLive()
        ? "PassMe — Tu tarjeta de visita en Apple Wallet y Google Wallet"
        : "PassMe — Tu tarjeta de visita en la cartera del móvil",
      template: "%s · PassMe",
    },
    description:
      "Crea tu tarjeta de contacto digital, añádela a la cartera del móvil y compártela con un QR. Tú eliges qué datos se ven.",
    applicationName: "PassMe",
    openGraph: {
      type: "website",
      siteName: "PassMe",
      locale: "es_ES",
    },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: "#f3efe6",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Every page is rendered per request so Next.js can stamp the CSP nonce from
  // src/proxy.ts onto its scripts (static HTML cannot carry a fresh nonce).
  await connection();
  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <body>
        {children}
        {/* Filled by announce() (src/lib/announce.ts): "Enlace copiado" and other short notices. */}
        <div id={LIVE_REGION_ID} aria-live="polite" aria-atomic="true" className="sr-only" />
      </body>
    </html>
  );
}
