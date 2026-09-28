import { after, type NextRequest } from "next/server";
import { recordEventForProfile } from "@/lib/data/events";
import { log } from "@/lib/log";
import { PKPASS_CONTENT_TYPE } from "@/lib/pass/apple";
import { buildApplePassForProfile, buildDemoApplePass, PassError, resolvePassOwnerId } from "@/lib/pass/service";
import { createRateLimiter } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export const runtime = "nodejs";
export const maxDuration = 30;

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

function errorResponse(error: unknown): Response {
  if (error instanceof PassError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  log.error("apple pass generation failed", {}, error);
  return Response.json({ error: "internal", message: "No hemos podido generar el pase." }, { status: 500 });
}

/**
 * GET /api/pass/apple            → the signed-in owner's pass
 * GET /api/pass/apple?t=<token>  → same, via a "send to phone" handoff link
 * GET /api/pass/apple?demo=1     → sample pass (to test certificates)
 */
export async function GET(request: NextRequest) {
  if (!limiter.check(getClientIp(request.headers)).ok) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const params = request.nextUrl.searchParams;
    const isDemo = params.get("demo") === "1";
    const profileId = isDemo ? null : await resolvePassOwnerId(params.get("t"));
    const pass = profileId ? await buildApplePassForProfile(profileId) : await buildDemoApplePass();

    if (profileId) after(() => recordEventForProfile(profileId, { kind: "pass_apple" }));

    return new Response(new Uint8Array(pass.buffer), {
      headers: {
        "Content-Type": PKPASS_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="passme-${pass.slug}.pkpass"`,
        "Cache-Control": "private, no-store",
        "Last-Modified": new Date().toUTCString(),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
