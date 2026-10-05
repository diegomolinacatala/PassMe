import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/**
 * "Añadir a pantalla de inicio" opens straight on the owner's QR: one tap from
 * the home screen to showing it (the Android stand-in for a wallet pass).
 * Icons come from `npm run brand`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PassMe",
    short_name: "PassMe",
    description: "Tu tarjeta de visita y tu QR, a un toque.",
    lang: "es",
    start_url: "/dashboard/qr",
    scope: "/",
    display: "standalone",
    background_color: BRAND.paper.toLowerCase(),
    theme_color: BRAND.paper.toLowerCase(),
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
