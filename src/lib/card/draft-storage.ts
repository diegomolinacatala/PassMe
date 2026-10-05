import type { VisitSource } from "@/lib/env";
import { coerceQuickDraft, parseVia, type QuickCardDraft } from "./quick";

/**
 * The quick-card draft, kept in this browser only while its owner signs in:
 * the email's button or Google may bring them back in another tab, and the
 * card should be waiting there. Written when they press "Crear mi tarjeta"
 * (not while typing), dropped once used, and short-lived (shared devices: the
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
      viaGoogle: parsed.viaGoogle === true,
      savedAt,
    };
  } catch {
    return null;
  }
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
      draft: coerceQuickDraft({ ...current?.draft, ...filled }),
      pending: false,
      from: from ?? current?.from ?? null,
      via: from ? via : (current?.via ?? "direct"),
      authEmail: null,
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
