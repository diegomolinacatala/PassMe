/**
 * One polite live region for the whole app (rendered by the root layout), so
 * short confirmations like "Enlace copiado" are read out once by screen
 * readers, whichever screen they come from.
 */
export const LIVE_REGION_ID = "passme-live";

/** Delay so assistive tech sees an emptied region first and announces even a repeated message. */
const ANNOUNCE_DELAY_MS = 60;
/** Cleared afterwards, so stale text isn't read again when the region is reached by browsing. */
const CLEAR_AFTER_MS = 5000;

let pending: ReturnType<typeof setTimeout> | undefined;
let clearing: ReturnType<typeof setTimeout> | undefined;

export function announce(text: string): void {
  if (typeof document === "undefined") return;
  const region = document.getElementById(LIVE_REGION_ID);
  if (!region) return;
  clearTimeout(pending);
  clearTimeout(clearing);
  region.textContent = "";
  pending = setTimeout(() => {
    region.textContent = text;
    clearing = setTimeout(() => {
      region.textContent = "";
    }, CLEAR_AFTER_MS);
  }, ANNOUNCE_DELAY_MS);
}
