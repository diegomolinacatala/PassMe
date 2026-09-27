import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/privacidad"], disallow: ["/dashboard", "/api/", "/auth/", "/wallet"] }],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
