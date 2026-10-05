import { after, NextResponse, type NextRequest } from "next/server";
import { recordEventForProfile } from "@/lib/data/events";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { passErrorResponse, passRateLimited } from "@/lib/pass/http";
import { assertDemoPassAllowed, buildDemoGoogleSaveUrl, buildGoogleSaveUrlForProfile, resolvePassOwnerId } from "@/lib/pass/service";
import { clientRateKey } from "@/lib/request";

export const runtime = "nodejs";

const limiter = createSharedRateLimiter({ name: "pass-google-ip", limit: 20, windowMs: 60_000 });

/** Redirects to Google's "Save to Google Wallet" page with a freshly signed JWT. */
export async function GET(request: NextRequest) {
  if (!(await limiter.check(clientRateKey(request.headers))).ok) {
    return passRateLimited(request);
  }

  try {
    const params = request.nextUrl.searchParams;
    const isDemo = params.get("demo") === "1";
    if (isDemo) await assertDemoPassAllowed();
    const profileId = isDemo ? null : await resolvePassOwnerId(params.get("t"));
    const url = profileId ? await buildGoogleSaveUrlForProfile(profileId) : await buildDemoGoogleSaveUrl();

    if (profileId) after(() => recordEventForProfile(profileId, { kind: "pass_google" }));

    const response = NextResponse.redirect(url, { status: 303 });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return passErrorResponse(request, error, "google");
  }
}
