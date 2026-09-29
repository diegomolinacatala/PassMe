/**
 * One-time login codes (isomorphic: the code screen and the server actions
 * share these rules).
 */

/** Digits in the emailed code. Must match Supabase → Email OTP Length (docs/SETUP.md 1.5). */
export const LOGIN_CODE_LENGTH = 8;

/** Supabase sends at most one email per address and minute (Auth → Rate Limits). */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Demo mode (no Supabase): nothing is emailed and this code signs you in. */
export const DEMO_LOGIN_CODE = "00000000";

const MAX_CODE_DIGITS = 10;

/** Keeps only the digits of whatever was typed or pasted ("1234 5678", "Código: 12345678"). */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, MAX_CODE_DIGITS);
}

/**
 * Seconds Supabase asks to wait before sending another email
 * ("For security purposes, you can only request this after 42 seconds."), or null.
 */
export function retryAfterSeconds(message: string | undefined): number | null {
  const match = message?.match(/after (\d{1,4}) seconds?/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : null;
}

export interface Inbox {
  name: string;
  url: string;
}

const INBOXES: ReadonlyArray<{ domains: readonly string[]; inbox: Inbox }> = [
  { domains: ["gmail.com", "googlemail.com"], inbox: { name: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" } },
  {
    domains: ["outlook.com", "outlook.es", "hotmail.com", "hotmail.es", "live.com", "msn.com"],
    inbox: { name: "Outlook", url: "https://outlook.live.com/mail/0/inbox" },
  },
  { domains: ["yahoo.com", "yahoo.es", "ymail.com"], inbox: { name: "Yahoo Mail", url: "https://mail.yahoo.com/" } },
  { domains: ["icloud.com", "me.com", "mac.com"], inbox: { name: "iCloud Mail", url: "https://www.icloud.com/mail" } },
  { domains: ["proton.me", "protonmail.com", "pm.me"], inbox: { name: "Proton Mail", url: "https://mail.proton.me/" } },
];

/** Webmail inbox for well-known providers: one tap from "we sent you a code" to the code. */
export function inboxFor(email: string): Inbox | null {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return null;
  return INBOXES.find((entry) => entry.domains.includes(domain))?.inbox ?? null;
}

/** "0:42" for the resend countdown. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
