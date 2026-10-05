"use client";

import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createMyCardAction } from "@/app/crear/actions";
import { EmailCodeAuth } from "@/components/auth/email-code-auth";
import { Avatar } from "@/components/card/avatar";
import { WalletPass, type PassStyle } from "@/components/card/wallet-pass";
import { useHydrated } from "@/components/use-hydrated";
import { DEMO_LOGIN_CODE } from "@/lib/auth/code";
import { clearStoredDraft, readStoredDraft, writeStoredDraft } from "@/lib/card/draft-storage";
import {
  createPath,
  EMPTY_QUICK_DRAFT,
  parseQuickDraft,
  quickDraftToPublicCard,
  type QuickCardDraft,
  type QuickTextField,
} from "@/lib/card/quick";
import type { FieldErrors } from "@/lib/card/schema";
import type { VisitSource } from "@/lib/env";
import { cn } from "@/lib/cn";
import { QuickCardForm } from "./quick-card-form";

/** guest: signs up at the end · member: signed in, card still empty · demo: no Supabase. */
export type CreateMode = "guest" | "member" | "demo";

export interface Referrer {
  slug: string;
  fullName: string;
  avatarUrl: string | null;
}

interface CreateFlowProps {
  mode: CreateMode;
  from: string | null;
  /** How they reached the referrer's card (/crear?via=…): the welcome adapts to it. */
  via: VisitSource;
  referrer: Referrer | null;
  /** Motif variation for a fresh draft (picked on the server so the preview hydrates as rendered). */
  initialSeed: number;
  accountEmail: string | null;
  previewStyle: PassStyle;
  googleEnabled: boolean;
  captchaSiteKey: string | null;
}

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * "Crea la tuya": the card first — it takes shape on the pass while you type —
 * and the email only at the end, to keep it. Signed-in people skip that step.
 */
export function CreateFlow({ mode, from, via, referrer, initialSeed, accountEmail, previewStyle, googleEnabled, captchaSiteKey }: CreateFlowProps) {
  const [draft, setDraft] = useState<QuickCardDraft>({ ...EMPTY_QUICK_DRAFT, patternSeed: initialSeed, email: accountEmail ?? "" });
  const [origin, setOrigin] = useState(from);
  const [originVia, setOriginVia] = useState(via);
  const [step, setStep] = useState<"form" | "auth">("form");
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [autoCreate, setAutoCreate] = useState(false);
  const [server, setServer] = useState<{ error: string; errors: FieldErrors; draft: QuickCardDraft } | null>(null);
  const [creating, startCreating] = useTransition();

  // Right after hydration, pick up what this browser already has: a draft typed
  // before signing in, or the details left in "Te dejo mi contacto".
  const hydrated = useHydrated();
  const [restored, setRestored] = useState(false);
  if (hydrated && !restored) {
    setRestored(true);
    const stored = readStoredDraft();
    if (stored) {
      setDraft({
        ...stored.draft,
        email: stored.draft.email || accountEmail || "",
        // 0 is what an incomplete stored draft gets: keep this visit's variation instead.
        patternSeed: stored.draft.patternSeed || initialSeed,
      });
      setOrigin(from ?? stored.from);
      if (!from) setOriginVia(stored.via);
      // Unattended only for the account the code went to (or Google, which PKCE ties to this
      // browser): a login link from someone else must not walk off with this draft.
      const sameAccount = stored.viaGoogle || stored.authEmail === accountEmail?.toLowerCase();
      if (mode === "member" && stored.pending && sameAccount) setAutoCreate(true);
    }
  }

  // The draft now lives in this page: drop the stored copy until "Crear mi tarjeta" asks again.
  // A card being created keeps it (another tab may need it) until the editor clears it.
  useEffect(() => {
    if (restored && step === "form" && !autoCreate) clearStoredDraft();
  }, [restored, step, autoCreate]);

  const rememberAuthEmail = useCallback(
    (email: string) =>
      writeStoredDraft({ draft, pending: true, from: origin, via: originVia, authEmail: email.toLowerCase(), viaGoogle: false }),
    [draft, origin, originVia],
  );
  const rememberGoogle = useCallback(
    () => writeStoredDraft({ draft, pending: true, from: origin, via: originVia, authEmail: null, viaGoogle: true }),
    [draft, origin, originVia],
  );

  // Moving between the form and the email step: tell screen readers where they are.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const validation = useMemo(() => parseQuickDraft(draft), [draft]);
  const localErrors: FieldErrors = validation.ok ? {} : validation.errors;
  const serverErrors = server && server.draft === draft ? server.errors : {};
  const shownErrors: FieldErrors = Object.fromEntries(
    Object.entries({ ...localErrors, ...serverErrors }).filter(([key]) => submitted || touched.has(key) || key in serverErrors),
  );

  const create = useCallback(
    (value: QuickCardDraft) => {
      startCreating(async () => {
        // Success redirects to the welcome screen; only failures come back.
        const result = await createMyCardAction(JSON.stringify(value), origin, originVia);
        if (result && !result.ok) setServer({ error: result.error, errors: result.errors ?? {}, draft: value });
      });
    },
    [origin, originVia],
  );

  // Back from Google or the email's button with a card ready to go: create it.
  const autoFired = useRef(false);
  useEffect(() => {
    if (!autoCreate || autoFired.current) return;
    autoFired.current = true;
    create(draft);
  }, [autoCreate, create, draft]);

  function submit() {
    setSubmitted(true);
    if (!validation.ok) return;
    if (mode === "member") {
      create(draft);
      return;
    }
    // Kept for the email's button or Google, which may finish in another tab.
    writeStoredDraft({ draft, pending: true, from: origin, via: originVia, authEmail: null, viaGoogle: false });
    setStep("auth");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  const preview = quickDraftToPublicCard(draft);
  const firstName = referrer?.fullName.split(/\s+/)[0] ?? "";

  return (
    <div
      className={cn(
        "mx-auto grid max-w-[1120px] gap-x-16 gap-y-8 px-5 pb-20 sm:px-8",
        "[grid-template-areas:'intro'_'preview'_'main'] lg:grid-cols-[minmax(0,1fr)_380px] lg:[grid-template-areas:'intro_preview'_'main_preview']",
      )}
    >
      <div className="[grid-area:intro]">
        {referrer ? (
          <div className="mb-5 inline-flex max-w-full items-center gap-2.5 rounded-full border hairline bg-card/70 py-1 pr-4 pl-1 text-sm text-ink-soft">
            <Avatar name={referrer.fullName} url={referrer.avatarUrl} size={28} className="shrink-0 text-ink ring-1 ring-line" />
            <span className="min-w-0 truncate">
              Vienes de la tarjeta de <strong className="font-medium text-ink">{referrer.fullName}</strong>
            </span>
          </div>
        ) : null}
        {step === "form" ? (
          <>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-[length:var(--text-title)] leading-[0.95] tracking-tight outline-none sm:text-6xl"
            >
              Tu tarjeta, <em className="text-signal">en un minuto.</em>
            </h1>
            <p className="mt-4 max-w-md text-ink-soft">
              {referrer
                ? `Rellena lo básico y mírala tomar forma. Luego enséñale tu QR a ${firstName} y tendrá tu contacto.`
                : "Rellena lo básico y mírala tomar forma. Foto, más contactos y diseño, cuando quieras."}
            </p>
            {mode === "member" && accountEmail ? (
              <p className="mt-3 text-sm text-muted">
                Con tu cuenta <strong className="font-medium text-ink-soft">{accountEmail}</strong>.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStep("form")}
              className="inline-flex items-center gap-1.5 rounded-full py-1 pr-3 text-sm text-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden /> Editar mis datos
            </button>
            <p className="eyebrow mt-5">Último paso</p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 font-display text-[length:var(--text-title)] leading-[0.95] tracking-tight outline-none sm:text-6xl"
            >
              Guárdala con <em className="text-signal">tu email.</em>
            </h1>
            <p className="mt-4 max-w-md text-ink-soft">
              Te mandamos un código para confirmar que eres tú. Con tu email podrás editarla cuando quieras, sin contraseñas.
            </p>
          </>
        )}
      </div>

      <aside
        // On phones the code screen needs the room: the card was already seen.
        className={cn("[grid-area:preview] lg:sticky lg:top-8 lg:self-start", step === "auth" && "max-lg:hidden")}
        aria-label="Vista previa de tu pase"
      >
        <div className="relative mx-auto w-full max-w-[340px] max-lg:max-h-[250px] max-lg:overflow-hidden max-lg:[mask-image:linear-gradient(to_bottom,black_72%,transparent)]">
          <WalletPass card={preview} style={previewStyle} className="animate-rise" />
        </div>
        <p className="mt-3 text-center text-xs text-muted max-lg:hidden">
          Así se verá en {previewStyle === "google" ? "Google Wallet" : "Apple Wallet"}. El QR lleva a tu tarjeta.
        </p>
      </aside>

      <div className="max-w-xl [grid-area:main]">
        {step === "form" ? (
          <QuickCardForm
            draft={draft}
            errors={shownErrors}
            onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
            onBlurField={(field: QuickTextField) => setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)))}
            onSubmit={submit}
            busy={creating}
            submitLabel="Crear mi tarjeta"
            busyLabel="Creando tu tarjeta…"
            formError={server && server.draft === draft ? server.error : null}
            footnote={
              mode === "member" ? null : (
                <>
                  Gratis. Solo te pediremos tu email para guardarla. Al continuar aceptas los{" "}
                  <a href="/terminos" className="underline underline-offset-2 hover:text-ink">
                    términos
                  </a>{" "}
                  y la{" "}
                  <a href="/privacidad" className="underline underline-offset-2 hover:text-ink">
                    privacidad
                  </a>
                  .
                </>
              )
            }
          />
        ) : (
          <div>
            {mode === "demo" ? (
              <p className="mb-6 rounded-2xl border border-dashed border-signal/50 bg-signal-wash/60 px-4 py-3 text-sm text-signal-deep">
                <strong>Modo demo.</strong> No se envía ningún email y el código es{" "}
                <span className="font-mono">{DEMO_LOGIN_CODE}</span>. La tarjeta no se guarda.
              </p>
            ) : null}
            <EmailCodeAuth
              next="/dashboard"
              continueTo={createPath(origin, originVia)}
              draft={JSON.stringify(draft)}
              from={origin}
              via={originVia}
              initialEmail={EMAIL_LIKE.test(draft.email.trim()) ? draft.email.trim() : ""}
              googleEnabled={googleEnabled}
              captchaSiteKey={captchaSiteKey}
              submitLabel="Crear mi tarjeta"
              autoFocus
              onCodeSent={rememberAuthEmail}
              onGoogle={rememberGoogle}
            />
          </div>
        )}
      </div>

      {autoCreate && creating ? (
        <div role="status" className="fixed inset-0 z-40 grid place-items-center bg-paper/80 backdrop-blur-sm">
          <p className="inline-flex items-center gap-3 rounded-full bg-card px-5 py-3 text-sm shadow-object">
            <LoaderCircle className="size-5 animate-spin text-signal" aria-hidden /> Creando tu tarjeta…
          </p>
        </div>
      ) : null}
    </div>
  );
}
