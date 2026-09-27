import type { NextConfig } from "next";

/**
 * Security headers for every response. The Content-Security-Policy is set per
 * request in src/proxy.ts because it carries a fresh script nonce.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // sharp + passkit-generator must stay native Node modules on the server.
  serverExternalPackages: ["sharp", "passkit-generator"],
  // Fonts read with fs at runtime by the Open Graph image routes.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./assets/fonts/**"],
    "/u/[slug]/opengraph-image": ["./assets/fonts/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
