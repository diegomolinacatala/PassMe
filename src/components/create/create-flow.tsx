"use client";

import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createMyCardAction } from "@/app/crear/actions";
import { authAction, type AuthState } from "@/app/login/actions";
import { EmailCodeAuth } from "@/components/auth/email-code-auth";
import { EmailTypoHint } from "@/components/auth/email-typo-hint";
import { Avatar } from "@/components/card/avatar";
import { WalletPass, type PassStyle } from "@/components/card/wallet-pass";
import { Field, inputClasses } from "@/components/ui/field";
import { Turnstile } from "@/components/ui/turnstile";
import { useHydrated } from "@/components/use-hydrated";
import { DEMO_LOGIN_CODE, LOGIN_CODE_TTL_MS } from "@/lib/auth/code";
import type { ChosenDesign } from "@/lib/card/design-query";
import { readStoredDraft, resumableCode, writeStoredDraft, type StoredDraft } from "@/lib/card/draft-storage";
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
import type { Platform } from "@/lib/platform";
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
  /**
   * Design of a fresh draft, picked on the server so the preview hydrates as
   * rendered: a random color (never the referrer's) and variation, or the one
   * chosen on the landing ("Hazla tuya", /crear?tema=…).
   */
  initialDesign: ChosenDesign;
  /** The link carries a design: it wins over whatever an older draft in this browser had. */
  designChosen: boolean;
  accountEmail: string | null;
  previewStyle: PassStyle;
  /** The wallet the preview stands for, or null when this phone has none to offer (Android before Google Wallet). */
  previewWallet: string | null;
  platform: Platform;
  googleEnabled: boolean;
  captchaSiteKey: string | null;
}

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Typing pauses this long before the draft is written to storage. */
const DRAFT_SAVE_DELAY_MS = 300;
const SEND_FAILED = "No hemos podido enviar el email. Inténtalo de nuevo.";

const isEmail = (value: string) => EMAIL_LIKE.test(value.trim());

/** The code sent last for this draft (lowercased address, this browser's clock). */
interface SentCode {
  email: string;
  sentAt: number;
}

/** The sign-in box: mounted when first needed, then only hidden, so a code in progress survives "Editar mis datos". */
interface AuthBox {
  key: number;
  initial: AuthState;
}

/**
 * "Crea la tuya": the card first — it takes shape on the pass while you type —
 * and the email only at the end, to keep it. With an email in the card,
 * "Crear mi tarjeta" sends the code straight away. Signed-in people skip all that.
 */
export function CreateFlow({
  mode,
  from,
  via,
  referrer,
  initialDesign,
  designChosen,
  accountEmail,
  previewStyle,
  previewWallet,
  platform,
  googleEnabled,
  captchaSiteKey,
}: CreateFlowProps) {
  const [draft, setDraft] = useState<QuickCardDraft>({
    ...EMPTY_QUICK_DRAFT,
    ...initialDesign,
    email: accountEmail ?? "",
  });
  const [origin, setOrigin] = useState(from);
  const [originVia, setOriginVia] = useState(via);
  const [step, setStep] = useState<"form" | "auth">("form");
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [autoCreate, setAutoCreate] = useState(false);
  const [server, setServer] = useState<{ error: string; errors: FieldErrors; draft: QuickCardDraft } | null>(null);
  const [creating, startCreating] = useTransition();

  // Signing in (guest and demo): the intent to create, the code that went out and the box showing it.
  const [wantsCard, setWantsCard] = useState(false);
  const [viaGoogle, setViaGoogle] = useState(false);
  const [sentCode, setSentCode] = useState<SentCode | null>(null);
  const [authBox, setAuthBox] = useState<AuthBox | null>(null);
  const [authStep, setAuthStep] = useState<"email" | "code">("email");
  /** null: the code goes to the card's email. A string: "Usar otro email" is open. */
  const [otherEmail, setOtherEmail] = useState<string | null>(null);
  const [otherEmailError, setOtherEmailError] = useState<string | undefined>();
  const [sendError, setSendError] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);
  const [sending, startSending] = useTransition();

  const showAuth = useCallback((box: AuthBox | null) => {
    if (box) {
      setAuthBox(box);
      setAuthStep(box.initial.step);
    }
    setStep("auth");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, []);

  // Right after hydration, pick up what this browser already has: the draft
  // being typed (a reload, a closed tab), one waiting for its code, or the
  // details left in "Déjale tu contacto".
  const hydrated = useHydrated();
  const [restored, setRestored] = useState(false);
  if (hydrated && !restored) {
    setRestored(true);
    const stored = readStoredDraft();
    if (stored) {
      setDraft({
        ...stored.draft,
        email: stored.draft.email || accountEmail || "",
        // 0 / "" is what an incomplete stored draft gets: keep this visit's variation and color instead.
        patternSeed: stored.draft.patternSeed || initialDesign.patternSeed,
        theme: stored.draft.theme || initialDesign.theme,
        // A design chosen just now (the landing's link) beats the one an older draft had.
        ...(designChosen ? initialDesign : {}),
      });
      setOrigin(from ?? stored.from);
      if (!from) setOriginVia(stored.via);
      if (mode === "member") {
        // Unattended only for the account the code went to (or Google, which PKCE ties to this
        // browser): a login link from someone else must not walk off with this draft.
        const sameAccount = stored.viaGoogle || stored.authEmail === accountEmail?.toLowerCase();
        if (stored.pending && sameAccount) setAutoCreate(true);
      } else {
        setWantsCard(stored.pending);
        setViaGoogle(stored.viaGoogle);
        // A code asked for moments ago still works: straight back to the 8 boxes.
        const code = resumableCode(stored);
        if (code) {
          setSentCode({ email: code.email, sentAt: code.sentAt });
          setAuthBox({
            key: 1,
            initial: { step: "code", email: code.email, sentAt: code.sentAt, resendIn: code.resendIn, resumed: true },
          });
          setAuthStep("code");
          setStep("auth");
        }
      }
    }
  }

  // Kept in this browser while it's typed and while signing in (the email's button
  // or Google may finish in another tab). Dropped once the card exists (SignedInBeacon).
  const snapshot = useMemo<Omit<StoredDraft, "savedAt">>(
    () =>
      mode === "member"
        ? { draft, pending: false, from: origin, via: originVia, authEmail: null, codeSentAt: null, viaGoogle: false }
        : {
            draft,
            pending: wantsCard,
            from: origin,
            via: originVia,
            authEmail: sentCode?.email ?? null,
            codeSentAt: sentCode?.sentAt ?? null,
            viaGoogle,
          },
    [mode, draft, wantsCard, origin, originVia, sentCode, viaGoogle],
  );
  useEffect(() => {
    // A card being created keeps the stored copy as it was (another tab may need it).
    if (!restored || autoCreate) return;
    const save = () => writeStoredDraft(snapshot);
    const timer = window.setTimeout(save, DRAFT_SAVE_DELAY_MS);
    // Reloading or closing within the delay still keeps the last keystroke.
    window.addEventListener("pagehide", save);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", save);
    };
  }, [restored, autoCreate, snapshot]);

  const rememberCode = useCallback((email: string, sentAt: number) => {
    // Never later than now: a server clock ahead of this one mustn't stretch the code's lifetime.
    const code = { email: email.toLowerCase(), sentAt: Math.min(Date.now(), sentAt) };
    setSentCode((prev) => (prev?.email === code.email && prev.sentAt === code.sentAt ? prev : code));
  }, []);
  const rememberGoogle = useCallback(() => {
    setViaGoogle(true);
    // Leaving for Google right now: no time for the delayed save.
    writeStoredDraft({ ...snapshot, viaGoogle: true });
  }, [snapshot]);

  // Moving between the form and the sign-in step: tell screen readers where they are
  // (on the code step the code box takes the focus: it says what was sent where).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const authRef = useRef<HTMLDivElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    const codeBox = step === "auth" ? authRef.current?.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]') : null;
    (codeBox ?? headingRef.current)?.focus();
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

  // Where the code goes: the card's email, or the one typed in "Usar otro email".
  const cardEmail = draft.email.trim();
  const cardHasEmail = isEmail(cardEmail);
  const codeEmail = otherEmail !== null ? otherEmail.trim() : cardHasEmail ? cardEmail : "";
  const asksForEmail = mode !== "member" && otherEmail === null && !cardHasEmail;

  /** Same request as "Enviarme un código" (rate limits, lockout, CAPTCHA); then, the 8 boxes. */
  function sendCode(email: string, captchaToken: string) {
    setSendError(null);
    startSending(async () => {
      const data = new FormData();
      data.set("intent", "send");
      data.set("email", email);
      data.set("next", "/dashboard");
      if (captchaToken) data.set("captchaToken", captchaToken);
      let result: AuthState;
      try {
        result = await authAction({ step: "email" }, data);
      } catch {
        result = { step: "email", email, error: SEND_FAILED };
      }
      // CAPTCHA tokens are single-use: the widget fetches another one.
      setCaptchaRound((n) => n + 1);
      if (result.step !== "code") {
        setSendError(result.error ?? SEND_FAILED);
        return;
      }
      showAuth({ key: (authBox?.key ?? 0) + 1, initial: result });
    });
  }

  function submit(form: FormData) {
    setSubmitted(true);
    if (!validation.ok) return;
    if (mode === "member") {
      create(draft);
      return;
    }
    if (otherEmail !== null && !isEmail(otherEmail)) {
      setOtherEmailError("Escribe el email con el que quieres guardarla.");
      return;
    }
    setWantsCard(true);
    if (!codeEmail) {
      // No email in the card: ask for one (or Google) on the next screen.
      showAuth(authBox ? null : { key: 1, initial: { step: "email" } });
      return;
    }
    const email = codeEmail.toLowerCase();
    const stillValid = sentCode?.email === email && Date.now() - sentCode.sentAt < LOGIN_CODE_TTL_MS;
    if (authBox && stillValid) {
      // Back from "Editar mis datos" with the same email: that code still works.
      showAuth(null);
      return;
    }
    sendCode(email, String(form.get("captchaToken") ?? ""));
  }

  const preview = quickDraftToPublicCard(draft);
  const firstName = referrer?.fullName.split(/\s+/)[0] ?? "";
  const onCodeStep = authStep === "code";

  const terms = (
    <>
      <a href="/terminos" className="underline underline-offset-2 hover:text-ink">
        términos
      </a>{" "}
      y la{" "}
      <a href="/privacidad" className="underline underline-offset-2 hover:text-ink">
        privacidad
      </a>
    </>
  );

  // Under "Crear mi tarjeta": where the code will go (and a way to change it), and the CAPTCHA.
  const signInNote =
    mode === "member" ? null : (
      <div className="space-y-3">
        {otherEmail !== null ? (
          <div className="space-y-2 text-left">
            <Field
              label="Email para guardarla"
              hint="Te mandaremos el código aquí. En tu tarjeta se verá el de arriba."
              error={otherEmailError}
            >
              {(props) => (
                <input
                  {...props}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  // Opened on purpose: straight to typing.
                  autoFocus
                  value={otherEmail}
                  onChange={(event) => {
                    setOtherEmail(event.target.value);
                    setOtherEmailError(undefined);
                  }}
                  placeholder="tu@email.com"
                  className={inputClasses()}
                />
              )}
            </Field>
            <EmailTypoHint email={otherEmail} onFix={(fixed) => setOtherEmail(fixed)} />
            {cardHasEmail ? (
              <button
                type="button"
                onClick={() => {
                  setOtherEmail(null);
                  setOtherEmailError(undefined);
                }}
                className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 hover:text-ink"
              >
                Usar el de mi tarjeta
              </button>
            ) : null}
          </div>
        ) : cardHasEmail ? (
          <div className="text-center">
            <p className="text-sm text-ink-soft">
              Te mandaremos un código a <strong className="font-semibold text-ink [overflow-wrap:anywhere]">{cardEmail}</strong> para
              guardarla.
              <span aria-hidden="true" className="text-muted">
                {" "}
                ·{" "}
              </span>
              <button
                type="button"
                onClick={() => setOtherEmail("")}
                className="inline-flex min-h-11 items-center text-muted underline underline-offset-4 hover:text-ink"
              >
                Usar otro email
              </button>
            </p>
            <EmailTypoHint email={cardEmail} onFix={(fixed) => setDraft((prev) => ({ ...prev, email: fixed }))} className="justify-center" />
          </div>
        ) : null}
        {captchaSiteKey ? <Turnstile siteKey={captchaSiteKey} action="login" resetKey={captchaRound} /> : null}
      </div>
    );

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
              // Signed in with an account that has no card: maybe the card lives under another email.
              <div className="mt-3 max-w-md text-sm text-muted">
                Has entrado como <strong className="font-medium text-ink-soft [overflow-wrap:anywhere]">{accountEmail}</strong>. ¿Ya
                tenías tarjeta con otro email?{" "}
                <form action="/auth/signout" method="post" className="inline">
                  <input type="hidden" name="next" value="/login" />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center font-medium text-ink-soft underline underline-offset-4 hover:text-ink"
                  >
                    Cerrar sesión y entrar con ese
                  </button>
                </form>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStep("form")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full pr-3 text-sm text-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden /> Editar mis datos
            </button>
            <p className="eyebrow mt-4">Último paso</p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 font-display text-[length:var(--text-title)] leading-[0.95] tracking-tight outline-none sm:text-6xl"
            >
              {onCodeStep ? (
                <>
                  Escribe <em className="text-signal">el código.</em>
                </>
              ) : (
                <>
                  Guárdala con <em className="text-signal">tu email.</em>
                </>
              )}
            </h1>
            <p className="mt-4 max-w-md text-ink-soft">
              {onCodeStep
                ? "Es para confirmar que eres tú. Con tu email podrás editarla cuando quieras, sin contraseñas."
                : "Te mandamos un código para confirmar que eres tú. Con tu email podrás editarla cuando quieras, sin contraseñas."}
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
          {previewWallet ? `Así se verá en ${previewWallet}. El QR lleva a tu tarjeta.` : "Así se verá tu tarjeta. El QR lleva a ella."}
        </p>
      </aside>

      <div className="max-w-xl [grid-area:main]">
        <div hidden={step !== "form"}>
          <QuickCardForm
            draft={draft}
            errors={shownErrors}
            onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
            onBlurField={(field: QuickTextField) => setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)))}
            onSubmit={submit}
            busy={creating || sending}
            submitLabel={asksForEmail ? "Continuar" : "Crear mi tarjeta"}
            busyLabel={sending ? "Enviando el código…" : "Creando tu tarjeta…"}
            formError={server && server.draft === draft ? server.error : sendError}
            afterSubmit={signInNote}
            footnote={
              mode === "member" ? null : asksForEmail ? (
                <>Gratis. Solo te pediremos tu email para guardarla. Al continuar aceptas los {terms}.</>
              ) : (
                <>Gratis. Al continuar aceptas los {terms}.</>
              )
            }
          />
        </div>
        <div ref={authRef} hidden={step !== "auth"}>
          {mode === "demo" ? (
            <p className="mb-6 rounded-2xl border border-dashed border-signal/50 bg-signal-wash/60 px-4 py-3 text-sm text-signal-deep">
              <strong>Modo demo.</strong> No se envía ningún email y el código es{" "}
              <span className="font-mono">{DEMO_LOGIN_CODE}</span>. La tarjeta no se guarda.
            </p>
          ) : null}
          {authBox ? (
            <EmailCodeAuth
              key={authBox.key}
              initialState={authBox.initial}
              next="/dashboard"
              continueTo={createPath(origin, originVia)}
              draft={JSON.stringify(draft)}
              from={origin}
              via={originVia}
              platform={platform}
              googleEnabled={googleEnabled}
              captchaSiteKey={captchaSiteKey}
              submitLabel="Crear mi tarjeta"
              autoFocus
              onCodeSent={rememberCode}
              onStepChange={setAuthStep}
              onGoogle={rememberGoogle}
            />
          ) : null}
        </div>
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
