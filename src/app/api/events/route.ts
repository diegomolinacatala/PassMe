import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { SLUG_MAX_LENGTH } from "@/lib/card/slug";
import { recordEventBySlug } from "@/lib/data/events";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { clientRateKey, isBot, parseVisitSource, readTextLimited } from "@/lib/request";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024;
const limiter = createSharedRateLimiter({ name: "events-ip", limit: 60, windowMs: 60_000 });

const eventSchema = z.object({
  slug: z.string().min(1).max(SLUG_MAX_LENGTH).regex(/^[a-z0-9-]+$/),
  kind: z.enum(["view", "link_click"]),
  source: z.string().max(16).optional(),
  linkId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(),
});

/** Beacon endpoint for card views and link clicks. Always answers 204 to keep beacons cheap. */
export async function POST(request: NextRequest) {
  const noContent = new Response(null, { status: 204 });

  if (isBot(request.headers.get("user-agent"))) return noContent;
  if (!(await limiter.check(clientRateKey(request.headers))).ok) return new Response(null, { status: 429 });

  const raw = await readTextLimited(request, MAX_BODY_BYTES);
  if (raw === null) return new Response(null, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 400 });

  const { slug, kind, source, linkId } = parsed.data;
  after(() =>
    recordEventBySlug(slug, {
      kind,
      source: parseVisitSource(source),
      linkId: kind === "link_click" ? (linkId ?? null) : null,
    }),
  );
  return noContent;
}
