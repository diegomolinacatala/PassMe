/**
 * In-app browsers (Instagram, Facebook, LinkedIn, Android WebViews): Google
 * refuses to sign anyone in from them ("Error 403: disallowed_useragent"), so
 * "Continuar con Google" would be a dead end there. The email code still works.
 */
const IN_APP_BROWSER_RE = /Instagram|FBAN|FBAV|LinkedInApp|; wv\)/;

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  return IN_APP_BROWSER_RE.test(userAgent ?? "");
}
