import { periodStart } from "./days";
import type { AdminRawData } from "./types";
import { buildUserRows, type AdminUserRow } from "./users";

/**
 * "Who has the card on their phone" (/crm/wallet). Apple tells PassMe when a
 * device adds or removes a pass, so that list is exact; Google doesn't, so
 * from Google only the taps on «Añadir a Google Wallet» are known.
 */

export interface WalletOverview {
  days: number;
  /** Cards on at least one Apple device (a paused card's pass stays there too). */
  appleCards: number;
  appleDevices: number;
  publishedCards: number;
  /** Published cards with the pass on an Apple device: the share's numerator. */
  publishedWithPass: number;
  installed: AdminUserRow[];
  /** Tapped «Añadir a Apple Wallet» in the period but no device has the pass now. */
  triedApple: AdminUserRow[];
  /** Tapped «Añadir a Google Wallet» in the period: whether they kept it is unknowable. */
  triedGoogle: AdminUserRow[];
  /** Published cards whose owner has no pass on any Apple device. */
  withoutPass: AdminUserRow[];
}

export function buildWalletOverview(raw: AdminRawData, { days, now }: { days: number; now: Date }): WalletOverview {
  const rows = buildUserRows(raw, periodStart(now, days));
  const installed = rows.filter((r) => r.appleDevices > 0);
  const bySince = (a: AdminUserRow, b: AdminUserRow) => Date.parse(b.walletSince ?? "") - Date.parse(a.walletSince ?? "");

  return {
    days,
    appleCards: installed.length,
    appleDevices: new Set(raw.registrations.map((r) => r.device)).size,
    publishedCards: rows.filter((r) => r.published).length,
    publishedWithPass: installed.filter((r) => r.published).length,
    installed: installed.sort(bySince),
    triedApple: rows.filter((r) => r.appleDevices === 0 && r.applePassTaps > 0),
    triedGoogle: rows.filter((r) => r.googlePassTaps > 0),
    withoutPass: rows.filter((r) => r.published && r.appleDevices === 0),
  };
}
