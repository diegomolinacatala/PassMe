/** Seconds a client is told to wait when the database could not answer. */
const RETRY_AFTER_SECONDS = 30;

/**
 * "Try again in a moment", for the public card routes (hero, vCard, QR,
 * link preview) when the database failed. It must not be a 404: crawlers and
 * browsers would take the card for deleted, and caches could keep saying so.
 */
export function cardUnavailableResponse(): Response {
  return new Response("Ahora mismo no podemos cargar esta tarjeta. Inténtalo en un momento.", {
    status: 503,
    headers: {
      "Retry-After": String(RETRY_AFTER_SECONDS),
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

/** The rate-limit refusal shared by the public image routes. */
export function tooManyRequestsResponse(retryAfterSeconds: number): Response {
  return new Response("Demasiadas peticiones", {
    status: 429,
    headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)), "Cache-Control": "no-store" },
  });
}
