"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { AVATAR_BUCKET, getSiteUrl } from "@/lib/env";
import { checkSlug, SLUG_ERRORS } from "@/lib/card/slug";
import { parseCardInput, type FieldErrors } from "@/lib/card/schema";
import type { OwnerCard } from "@/lib/card/types";
import { isSlugAvailable, saveOwnerCard } from "@/lib/data/cards";
import { log } from "@/lib/log";
import { HANDOFF_TTL_SECONDS, signHandoffToken } from "@/lib/pass/handoff";
import { notifyWalletsOfUpdate } from "@/lib/pass/service";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase, getSessionUser, type TypedSupabaseClient } from "@/lib/supabase/server";

/*
 * Every action re-checks the session: Server Functions are reachable by POST
 * regardless of what proxy.ts matches, so auth must never rely on it alone.
 */

async function requireUser() {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const user = await getSessionUser(supabase);
  return user ? { supabase, user } : null;
}

export type SaveCardResult = { ok: true; card: OwnerCard } | { ok: false; errors: FieldErrors };

export async function saveCardAction(input: unknown): Promise<SaveCardResult> {
  const session = await requireUser();
  if (!session) return { ok: false, errors: { _form: "Tu sesión ha caducado. Vuelve a entrar." } };

  const parsed = parseCardInput(input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const result = await saveOwnerCard(session.supabase, session.user.id, parsed.data);
  if (!result.ok) return { ok: false, errors: result.errors };

  revalidatePath(`/u/${result.card.slug}`);
  if (result.slugChanged) revalidatePath(`/u/${result.previousSlug}`);

  const userId = session.user.id;
  const currentAvatar = result.card.avatarPath;
  after(async () => {
    await Promise.allSettled([notifyWalletsOfUpdate(userId), cleanupAvatars(session.supabase, userId, currentAvatar)]);
  });

  return { ok: true, card: result.card };
}

/** Removes replaced or abandoned uploads from the user's avatar folder. */
async function cleanupAvatars(supabase: TypedSupabaseClient, userId: string, keep: string | null): Promise<void> {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).list(userId, { limit: 100 });
  if (error) {
    log.warn("avatar list failed", { userId }, error);
    return;
  }
  const stale = data.map((file) => `${userId}/${file.name}`).filter((path) => path !== keep);
  if (stale.length === 0) return;
  const removal = await supabase.storage.from(AVATAR_BUCKET).remove(stale);
  if (removal.error) log.warn("avatar cleanup failed", { userId }, removal.error);
}

export type SlugCheckResult = { status: "available" | "taken" | "invalid"; message?: string };

export async function checkSlugAction(raw: string): Promise<SlugCheckResult> {
  const slug = String(raw ?? "").trim().toLowerCase();
  const check = checkSlug(slug);
  if (!check.ok) return { status: "invalid", message: SLUG_ERRORS[check.reason] };

  const session = await requireUser();
  if (!session) return { status: "invalid", message: "Tu sesión ha caducado." };

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

export type DeleteAccountResult = { ok: false; error: string };

/** GDPR-style hard delete: auth user (cascades to all tables) + avatar files. */
export async function deleteAccountAction(confirmation: string): Promise<DeleteAccountResult> {
  const session = await requireUser();
  if (!session) return { ok: false, error: "Tu sesión ha caducado." };
  if (String(confirmation).trim().toUpperCase() !== "BORRAR") {
    return { ok: false, error: 'Escribe "BORRAR" para confirmar.' };
  }

  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY en el servidor." };

  const userId = session.user.id;
  await cleanupAvatars(session.supabase, userId, null);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    log.error("deleteUser failed", { userId }, error);
    return { ok: false, error: "No hemos podido borrar la cuenta. Escríbenos y lo hacemos a mano." };
  }

  await session.supabase.auth.signOut().catch(() => undefined);
  redirect("/?cuenta=borrada");
}
