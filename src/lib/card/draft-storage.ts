import { LOGIN_CODE_TTL_MS, RESEND_COOLDOWN_SECONDS } from "@/lib/auth/code";
import type { VisitSource } from "@/lib/env";
import { coerceQuickDraft, parseVia, type QuickCardDraft } from "./quick";

/**
 * The quick-card draft, kept in this browser while it's being filled in and
 * while its owner signs in: a reload, a closed tab or the email's button
 * (which may open another tab) must not lose what they typed. Written as they
 * type, dropped once the card exists, and short-lived (shared devices: the
 * login code itself expires in 10 minutes). Every access is guarded — storage
 * can be missing or blocked (private mode, in-app browsers).
 */

const KEY = "passme:quick-draft";
export const DRAFT_TTL_MS = 20 * 60_000;

export interface StoredDraft {
  draft: QuickCardDraft;
  /** Set when the owner pressed "Crear mi tarjeta": create it as soon as they're signed in. */
  pending: boolean;
  /** Slug of the card that led here (/crear?de=…). */
  from: string | null;
  /** How they reached that card (/crear?via=…). Older drafts lack it: "direct". */
  via: VisitSource;
  /** Email the login code was sent to: only that account may create the card unattended. */
  authEmail: string | null;
  /** When that code went out (this browser's clock): within its lifetime, a reload reopens the code step. */
  codeSentAt: number | null;
  /** They chose Google (PKCE ties that sign-in to this browser, so it may create the card unattended). */
  viaGoogle: boolean;
  savedAt: number;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStoredDraft(now: number = Date.now()): StoredDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (now - savedAt > DRAFT_TTL_MS || now < savedAt) {
      store.removeItem(KEY);
      return null;
    }
    return {
      draft: coerceQuickDraft(parsed.draft),
      pending: parsed.pending === true,
      from: typeof parsed.from === "string" ? parsed.from : null,
      via: parseVia(parsed.via),
      authEmail: typeof parsed.authEmail === "string" ? parsed.authEmail : null,
      codeSentAt: typeof parsed.codeSentAt === "number" && Number.isFinite(parsed.codeSentAt) ? parsed.codeSentAt : null,
      viaGoogle: parsed.viaGoogle === true,
      savedAt,
    };
  } catch {
    return null;
  }
}

export interface ResumableCode {
  email: string;
  sentAt: number;
  /** Seconds before another one can be asked for. */
  resendIn: number;
}

/** The code step to reopen after a reload: a code was asked for this draft and still works. */
export function resumableCode(stored: StoredDraft | null, now: number = Date.now()): ResumableCode | null {
  if (!stored?.pending || !stored.authEmail || stored.codeSentAt === null) return null;
  const age = now - stored.codeSentAt;
  if (age < 0 || age >= LOGIN_CODE_TTL_MS) return null;
  return {
    email: stored.authEmail,
    sentAt: stored.codeSentAt,
    resendIn: Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor(age / 1000)),
  };
}

export function writeStoredDraft(value: Omit<StoredDraft, "savedAt">, now: number = Date.now()): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ ...value, savedAt: now }));
  } catch {
    // Full or blocked storage: the form still works, it just won't survive a new tab.
  }
}

/** Merges details the visitor already typed elsewhere (e.g. "Te dejo mi contacto") into the draft. */
export function rememberDetails(
  details: Partial<QuickCardDraft>,
  from: string | null,
  via: VisitSource = "direct",
  now: number = Date.now(),
): void {
  const current = readStoredDraft(now);
  const filled = Object.fromEntries(Object.entries(details).filter(([, value]) => typeof value === "string" && value.trim()));
  writeStoredDraft(
    {
      // No color chosen yet ("" rather than the default): /crear picks one, unlike the referrer's.
      draft: coerceQuickDraft({ theme: "", ...current?.draft, ...filled }),
      pending: false,
      from: from ?? current?.from ?? null,
      via: from ? via : (current?.via ?? "direct"),
      authEmail: null,
      codeSentAt: null,
      viaGoogle: false,
    },
    now,
  );
}

export function clearStoredDraft(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // nothing to clean up
  }
}
