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

/** Which wallets can be offered right now (Google only once GOOGLE_WALLET_LIVE is on). */
export interface WalletOffer {
  apple: boolean;
  google: boolean;
}

/**
 * The one "keep it on your phone" action for this phone: its own wallet when
 * that works, otherwise the full-screen QR ("Guardar mi QR en el móvil").
 * Computers get none: they hand the pass over to the phone instead.
 */
export function phoneWalletAction(platform: Platform, offer: WalletOffer): "apple" | "google" | "qr" | null {
  if (platform === "ios") return offer.apple ? "apple" : "qr";
  if (platform === "android") return offer.google ? "google" : "qr";
  return null;
}

/**
 * One line on the "Mi QR" screen explaining how to pin it to the home screen
 * (its manifest opens straight on the QR). Android only needs it while Google
 * Wallet isn't offered; with a pass in the wallet there's a better shortcut.
 */
export function homeScreenHint(platform: Platform, googleWalletLive: boolean): string | null {
  if (platform === "ios") return "Añádela a tu pantalla de inicio: Compartir → Añadir a pantalla de inicio";
  if (platform === "android" && !googleWalletLive) return "Añádela a tu pantalla de inicio: ⋮ → Añadir a pantalla de inicio";
  return null;
}
