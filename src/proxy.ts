import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/env";

/**
 * Runs before every page/API request (see matcher):
 *  1. Issues a per-request CSP nonce (Next.js applies it to its own scripts).
 *  2. Refreshes the Supabase session cookie.
 *  3. Gates /dashboard behind login (Server Functions re-check auth themselves).
 */

const PROTECTED_PREFIXES = ["/dashboard"];
const AUTH_PAGES = ["/login"];

function buildCsp(nonce: string, supabaseUrl: string | null): string {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = supabaseUrl ? ` ${supabaseUrl}` : "";
  const supabaseRealtime = supabaseUrl ? ` ${supabaseUrl.replace(/^http/, "ws")}` : "";

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are needed for per-card accent colors.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${supabase}`,
    "font-src 'self'",
    `connect-src 'self'${supabase}${supabaseRealtime}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const config = getSupabasePublicConfig();
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, config?.url ?? null);

  // Rebuilt after every cookie refresh so rendering sees the new session.
  const forwardedHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    return headers;
  };

  let response = NextResponse.next({ request: { headers: forwardedHeaders() } });
  let isAuthenticated = false;

  if (config) {
    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, cacheHeaders) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: forwardedHeaders() } });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(cacheHeaders)) response.headers.set(key, value);
        },
      },
    });

    // getClaims() verifies the JWT; do not put logic between client creation and this call.
    const { data } = await supabase.auth.getClaims();
    isAuthenticated = Boolean(data?.claims?.sub);

    const { pathname, search } = request.nextUrl;
    let redirectTo: URL | null = null;

    if (!isAuthenticated && startsWithAny(pathname, PROTECTED_PREFIXES)) {
      redirectTo = new URL("/login", request.url);
      redirectTo.searchParams.set("next", `${pathname}${search}`);
    } else if (isAuthenticated && startsWithAny(pathname, AUTH_PAGES)) {
      redirectTo = new URL("/dashboard", request.url);
    }

    if (redirectTo) {
      const redirect = NextResponse.redirect(redirectTo);
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except static assets and the Apple Wallet web service.
      source:
        "/((?!_next/static|_next/image|api/wallet|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
