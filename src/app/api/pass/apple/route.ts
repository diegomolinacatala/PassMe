import { after, type NextRequest } from "next/server";
import { recordEventForProfile } from "@/lib/data/events";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { PKPASS_CONTENT_TYPE } from "@/lib/pass/apple";
import { passErrorResponse, passRateLimited } from "@/lib/pass/http";
import { assertDemoPassAllowed, buildApplePassForProfile, buildDemoApplePass, resolvePassOwnerId } from "@/lib/pass/service";
import { clientRateKey } from "@/lib/request";

export const runtime = "nodejs";
export const maxDuration = 30;

const limiter = createSharedRateLimiter({ name: "pass-apple-ip", limit: 20, windowMs: 60_000 });

/**
 * GET /api/pass/apple            → the signed-in owner's pass
 * GET /api/pass/apple?t=<token>  → same, via a "send to phone" handoff link
 * GET /api/pass/apple?demo=1     → sample pass (to test certificates; needs a session once Supabase is set up)
 */
export async function GET(request: NextRequest) {
  if (!(await limiter.check(clientRateKey(request.headers))).ok) {
    return passRateLimited(request);
  }

  try {
    const params = request.nextUrl.searchParams;
    const isDemo = params.get("demo") === "1";
    if (isDemo) await assertDemoPassAllowed();
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
    return passErrorResponse(request, error, "apple");
  }
}
