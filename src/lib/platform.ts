/**
 * Which wallet the visitor's phone has, from the User-Agent. iPads and Macs
 * count as "other": neither can add passes as conveniently as a phone.
 */
export type Platform = "ios" | "android" | "other";

export function detectPlatform(userAgent: string | null | undefined): Platform {
  if (!userAgent) return "other";
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipod/i.test(userAgent)) return "ios";
  return "other";
}
