"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { AVATAR_BUCKET, getSiteUrl, profileUrl } from "@/lib/env";
import { parseContactRequest } from "@/lib/card/contact";
import { DEMO_SLUG } from "@/lib/card/demo";
import { parseFromSlug, parseVia } from "@/lib/card/quick";
import { sendCardDetails } from "@/lib/card/send-card";
import { checkNewSlug, SLUG_ERRORS } from "@/lib/card/slug";
import { parseCardInput, type FieldErrors } from "@/lib/card/schema";
import type { OwnerCard } from "@/lib/card/types";
import { contactIpLimiter, deliverContactRequest, DELIVERY_ERRORS, GENERIC_DELIVERY_ERROR } from "@/lib/contact-delivery";
import { findOwnerCard, isSlugAvailable, saveOwnerCard } from "@/lib/data/cards";
import { deleteContactRequest } from "@/lib/data/contact-requests";
import { deleteOwnMeeting, findMeetingRecord, lookupOwnMeeting } from "@/lib/data/meetings";
import { createSharedRateLimiter } from "@/lib/data/rate-limits";
import { log } from "@/lib/log";
import { changeMeeting } from "@/lib/meetings/service";
import { clientRateKey } from "@/lib/request";
import { HANDOFF_TTL_SECONDS, signHandoffToken } from "@/lib/pass/handoff";
import { notifyWalletsOfUpdate, withdrawWalletPasses } from "@/lib/pass/service";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase, getSessionUser, type TypedSupabaseClient } from "@/lib/supabase/server";

/*
 * Every action re-checks the session: Server Functions are reachable by POST
 * regardless of what proxy.ts matches, so auth must never rely on it alone.
 */

// Each save can fan out to APNs and the Google Wallet API: keep it human-paced.
const saveLimiter = createSharedRateLimiter({ name: "save-user", limit: 30, windowMs: 10 * 60_000 });
// The slug field asks while typing (debounced); every ask is a database read.
const slugCheckLimiter = createSharedRateLimiter({ name: "slug-check-user", limit: 60, windowMs: 60_000 });

async function requireUser() {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const user = await getSessionUser(supabase);
  return user ? { supabase, user } : null;
}

export type SaveCardResult =
  | { ok: true; card: OwnerCard; /** Part of the design couldn't be stored yet (pending migration). */ designPending: boolean }
  | { ok: false; errors: FieldErrors };

export async function saveCardAction(input: unknown): Promise<SaveCardResult> {
  const session = await requireUser();
  if (!session) return { ok: false, errors: { _form: "Tu sesión ha caducado. Vuelve a entrar." } };
  if (!(await saveLimiter.check(session.user.id)).ok) {
    return { ok: false, errors: { _form: "Demasiados guardados seguidos. Espera unos minutos." } };
  }

  const parsed = parseCardInput(input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const result = await saveOwnerCard(session.supabase, session.user.id, parsed.data);
  if (!result.ok) return { ok: false, errors: result.errors };

  revalidatePath(`/u/${result.card.slug}`);
  if (result.slugChanged) revalidatePath(`/u/${result.previousSlug}`);

  const userId = session.user.id;
  const currentAvatar = result.card.avatarPath;
  const changed = result.changed;
  after(async () => {
    await Promise.allSettled([
      changed ? notifyWalletsOfUpdate(userId) : Promise.resolve(),
      cleanupAvatars(session.supabase, userId, currentAvatar),
    ]);
  });

  return { ok: true, card: result.card, designPending: result.designPending };
}

/** Pages of avatar files removed per account deletion before giving up (a folder holds a handful at most). */
const MAX_AVATAR_PAGES = 20;
const AVATAR_PAGE_SIZE = 100;

/**
 * Removes every file in the user's avatar folder, page by page until it is
 * empty (each pass lists again from the start: removed files shift the list).
 * False when anything failed or files remain: the caller must not delete the
 * account then, or the photo would outlive it in the public bucket.
 */
async function removeAllAvatars(admin: TypedSupabaseClient, userId: string): Promise<boolean> {
  for (let page = 0; page < MAX_AVATAR_PAGES; page += 1) {
    const { data, error } = await admin.storage.from(AVATAR_BUCKET).list(userId, { limit: AVATAR_PAGE_SIZE });
    if (error) {
      log.error("avatar list failed during account deletion", { userId }, error);
      return false;
    }
    // Folders (id === null) can't be created under the current policy; skip them defensively.
    const paths = data.filter((file) => file.id !== null).map((file) => `${userId}/${file.name}`);
    if (paths.length === 0) return true;
    const removal = await admin.storage.from(AVATAR_BUCKET).remove(paths);
    if (removal.error) {
      log.error("avatar removal failed during account deletion", { userId }, removal.error);
      return false;
    }
  }
  log.error("avatar folder still not empty during account deletion", { userId, pages: MAX_AVATAR_PAGES });
  return false;
}

/** Removes replaced or abandoned uploads from the user's avatar folder (flat by policy). */
async function cleanupAvatars(supabase: TypedSupabaseClient, userId: string, keep: string | null): Promise<void> {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).list(userId, { limit: 1000 });
  if (error) {
    log.warn("avatar list failed", { userId }, error);
    return;
  }
  // Folders (id === null) can't be created under the current policy; skip them defensively.
  const stale = data
    .filter((file) => file.id !== null)
    .map((file) => `${userId}/${file.name}`)
    .filter((path) => path !== keep);
  if (stale.length === 0) return;
  const removal = await supabase.storage.from(AVATAR_BUCKET).remove(stale);
  if (removal.error) log.warn("avatar cleanup failed", { userId }, removal.error);
}

export type SlugCheckResult = { status: "available" | "taken" | "invalid"; message?: string };

export async function checkSlugAction(raw: string): Promise<SlugCheckResult> {
  const slug = String(raw ?? "").trim().toLowerCase();
  // Only called for a handle the owner is switching to (the editor skips their current one).
  const check = checkNewSlug(slug);
  if (!check.ok) return { status: "invalid", message: SLUG_ERRORS[check.reason] };

  const session = await requireUser();
  if (!session) return { status: "invalid", message: "Tu sesión ha caducado." };
  if (!(await slugCheckLimiter.check(session.user.id)).ok) {
    return { status: "invalid", message: "Demasiadas comprobaciones seguidas. Espera un momento." };
  }

  try {
    return (await isSlugAvailable(session.supabase, slug))
      ? { status: "available" }
      : { status: "taken", message: "Ese enlace ya está cogido." };
  } catch (error) {
    log.warn("slug check failed", {}, error);
    return { status: "invalid", message: "No hemos podido comprobarlo." };
  }
}

export type HandoffResult = { ok: true; url: string; expiresAt: string } | { ok: false; error: string };

/** Signed link (QR on desktop) that opens "add to wallet" on the owner's phone. */
export async function createHandoffLinkAction(): Promise<HandoffResult> {
  const session = await requireUser();
  if (!session) return { ok: false, error: "Tu sesión ha caducado." };

  const token = await signHandoffToken(session.user.id);
  if (!token) return { ok: false, error: "Falta configurar PASSME_SIGNING_SECRET en el servidor." };

  return {
    ok: true,
    url: `${getSiteUrl()}/wallet?t=${encodeURIComponent(token)}`,
    expiresAt: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000).toISOString(),
  };
}

export type SendCardResult =
  | { ok: true; /** Demo mode or the sample card: nothing was sent. */ demo?: boolean }
  | { ok: false; error: string; /** It can't be sent this way (closed card, no email or phone): offer sharing the link. */ shareInstead?: boolean };

// A welcome sends one card; a few retries are plenty.
const sendCardLimiter = createSharedRateLimiter({ name: "send-card-user", limit: 5, windowMs: 60 * 60_000 });

/**
 * "Mandarle mi tarjeta a Alex", from the welcome of a card made from Alex's:
 * leaves the signed-in owner's details in Alex's "Contactos recibidos". Only
 * the target card and the visit source come from the browser (both
 * validated); who sends it and what is sent are read from the sender's own
 * saved card, never from the client.
 */
export async function sendMyCardAction(toSlug: string, via: string): Promise<SendCardResult> {
  const target = parseFromSlug(toSlug);
  if (!target) return { ok: false, error: GENERIC_DELIVERY_ERROR };

  const supabase = await createServerSupabase();
  // Demo mode, or the sample card: there's no one to send it to.
  if (!supabase || target === DEMO_SLUG) return { ok: true, demo: true };

  const user = await getSessionUser(supabase);
  if (!user) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };
  if (!(await sendCardLimiter.check(user.id)).ok) {
    return { ok: false, error: "Has mandado tu tarjeta varias veces seguidas. Prueba dentro de un rato." };
  }

  const card = await findOwnerCard(supabase, user.id);
  if (!card?.fullName) return { ok: false, error: "Guarda tu tarjeta antes de mandarla." };
  if (card.slug === target) return { ok: false, error: "Esa es tu propia tarjeta." };

  const parsed = parseContactRequest({ ...sendCardDetails(card, user.email, profileUrl(card.slug)), consent: true });
  if (!parsed.ok) {
    return { ok: false, error: "Tu tarjeta necesita un email o un teléfono visibles para poder mandarla.", shareInstead: true };
  }
  if (!(await contactIpLimiter.check(clientRateKey(await headers()))).ok) {
    return { ok: false, error: "Has enviado varios contactos seguidos. Prueba dentro de un rato." };
  }

  const delivery = await deliverContactRequest(target, parsed.data, parseVia(via));
  if (!delivery.ok) return { ok: false, error: DELIVERY_ERRORS[delivery.reason], shareInstead: delivery.reason === "closed" };
  return { ok: true };
}

export type DeleteResult = { ok: true; emailsSkipped?: true } | { ok: false; error: string };

/** Removes one contact request (RLS: only the card owner can delete it). */
export async function deleteContactRequestAction(id: string): Promise<DeleteResult> {
  const session = await requireUser();
  if (!session) return { ok: false, error: "Tu sesión ha caducado." };
  const deleted = await deleteContactRequest(session.supabase, String(id));
  return deleted ? { ok: true } : { ok: false, error: "No hemos podido borrarlo. Inténtalo de nuevo." };
}

/** Removes a meeting from the owner's list (RLS: only the card owner can delete it). */
export async function deleteMeetingAction(id: string): Promise<DeleteResult> {
  const session = await requireUser();
  if (!session) return { ok: false, error: "Tu sesión ha caducado." };
  const result = await deleteOwnMeeting(session.supabase, String(id));
  if (result.ok) return { ok: true };
  return {
    ok: false,
    error:
      result.reason === "upcoming"
        ? "Esta reunión sigue en pie: cancélala desde su página para que la otra persona se entere."
        : "No hemos podido quitarla. Inténtalo de nuevo.",
  };
}

// Each "no" sends an email: keep it human-paced.
const declineLimiter = createSharedRateLimiter({ name: "meeting-decline-owner", limit: 20, windowMs: 10 * 60_000 });

/**
 * «Decir que no» from the editor: the same change and email as "No puedo" on
 * the meeting's signed page, authorized by the session instead of the link.
 */
export async function declineMeetingAction(id: string): Promise<DeleteResult> {
  const session = await requireUser();
  if (!session) return { ok: false, error: "Tu sesión ha caducado." };
  const meetingId = String(id).toLowerCase();
  const notFound = { ok: false as const, error: "No encontramos esta propuesta. Recarga la página." };
  if (!(await declineLimiter.check(session.user.id)).ok) return { ok: false, error: "Demasiados cambios seguidos. Espera unos minutos." };
  // A database hiccup is not "it's gone": the owner can simply try again.
  const retry = { ok: false as const, error: "No hemos podido comprobarlo. Inténtalo de nuevo." };
  // RLS says it's theirs; the stored owner must agree.
  const ownership = await lookupOwnMeeting(session.supabase, meetingId);
  if (ownership === "error") return retry;
  if (ownership === "none") return notFound;
  const lookup = await findMeetingRecord(meetingId);
  if (lookup.status === "error") return retry;
  if (lookup.status === "missing" || lookup.record.owner.id !== session.user.id) return notFound;
  const result = await changeMeeting(lookup.record, "owner", { action: "decline", note: "" });
  if (!result.ok) return { ok: false, error: result.error };
  after(result.emails);
  return result.emailsSkipped ? { ok: true, emailsSkipped: true } : { ok: true };
}

export type DeleteAccountResult = { ok: false; error: string };

/** GDPR-style hard delete: auth user (cascades to all tables) + avatar files. */
export async function deleteAccountAction(confirmation: string): Promise<DeleteAccountResult> {
  const session = await requireUser();
  if (!session) return { ok: false, error: "Tu sesión ha caducado." };
  if (String(confirmation).trim().toUpperCase() !== "BORRAR") {
    return { ok: false, error: 'Escribe "BORRAR" para confirmar.' };
  }

  const admin = createAdminSupabase();
  if (!admin) {
    // A setup problem, not something the person can fix: details to the log only.
    log.error("account deletion unavailable: SUPABASE_SECRET_KEY is missing", {});
    return { ok: false, error: "No hemos podido borrar la cuenta. Escríbenos y lo hacemos a mano." };
  }

  const userId = session.user.id;
  // The photo lives in a public bucket: it goes first, and if it can't, the account stays (it is still theirs to retry).
  if (!(await removeAllAvatars(admin, userId))) {
    return { ok: false, error: "No hemos podido borrar la cuenta. Escríbenos y lo hacemos a mano." };
  }
  // Their Google Wallet pass would keep showing their details otherwise. Needs the card, so before deleteUser; best effort.
  await withdrawWalletPasses(userId);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    log.error("deleteUser failed", { userId }, error);
    return { ok: false, error: "No hemos podido borrar la cuenta. Escríbenos y lo hacemos a mano." };
  }

  await session.supabase.auth.signOut().catch(() => undefined);
  redirect("/?cuenta=borrada");
}
