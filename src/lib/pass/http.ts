import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { PassError } from "./service";

/**
 * Pass downloads are plain links. When a person follows one (a navigation),
 * failures must land on a page that says what to do, never on raw JSON; a
 * script's fetch still gets JSON.
 */
export function isNavigation(request: Request): boolean {
  if (request.headers.get("sec-fetch-mode") === "navigate") return true;
  return (request.headers.get("accept") ?? "").includes("text/html");
}

/** Notice codes the editor understands (/dashboard?pase=…). */
export type PassNotice = "error" | "espera" | "pronto";

function redirectTo(request: Request, path: string): Response {
  const response = NextResponse.redirect(new URL(path, request.url), { status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function passRateLimited(request: Request): Response {
  if (isNavigation(request)) return redirectTo(request, "/dashboard?pase=espera");
  return Response.json({ error: "rate_limited" }, { status: 429 });
}

/** Turns a failed pass request into a readable page (navigations) or JSON (fetch). */
export function passErrorResponse(request: Request, error: unknown, wallet: "apple" | "google"): Response {
  if (!(error instanceof PassError)) log.error(`${wallet} pass generation failed`, {}, error);
  if (isNavigation(request)) {
    const token = new URL(request.url).searchParams.get("t");
    if (error instanceof PassError && error.status === 401) {
      // A "send to my phone" link that no longer works explains itself on /wallet.
      return redirectTo(request, token ? `/wallet?t=${encodeURIComponent(token)}` : "/login?next=/dashboard");
    }
    const notice: PassNotice = error instanceof PassError && error.code === "not_configured" ? "pronto" : "error";
    return redirectTo(request, `/dashboard?pase=${notice}`);
  }
  if (error instanceof PassError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  return Response.json({ error: "internal", message: "No hemos podido generar el pase." }, { status: 500 });
}
