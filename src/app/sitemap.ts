import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";

/** Only marketing pages: personal cards are intentionally not listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  return [
    { url: `${site}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/privacidad`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/terminos`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/aviso-legal`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
