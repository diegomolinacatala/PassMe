"use client";

import { ArrowUpRight, LoaderCircle, Pencil } from "lucide-react";
import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { authAction, signInWithGoogle, type AuthState } from "@/app/login/actions";
import { InlineError, inputClasses } from "@/components/ui/field";
import { NewTabHint } from "@/components/ui/new-tab-hint";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { Turnstile } from "@/components/ui/turnstile";
import { formatCountdown, inboxFor, LOGIN_CODE_LENGTH } from "@/lib/auth/code";
import type { Platform } from "@/lib/platform";
import { CodeInput } from "./code-input";
import { EmailTypoHint } from "./email-typo-hint";
import { useSignedInElsewhere } from "./session-sync";

export interface EmailCodeAuthProps {
  /** Where to go after signing in (ignored when a quick-card `draft` is sent). */
  next: string;
  /** Where to go if this browser gets signed in from another tab (the email's button). */
  continueTo: string;
  /** Quick-card draft (JSON) to create right after signing in — the /crear flow. */
  draft?: string;
  /** Slug of the card that led to /crear. */
  from?: string | null;
  /** How the newcomer reached that card ("qr", "share"); travels with `from`. */
  via?: string;
  initialEmail?: string;
  initialError?: string;
  /** Where to start instead of the email step: a code /crear already sent (or is resuming). */
  initialState?: AuthState;
  /** The visitor's phone, from the server: on an iPhone "Abrir Gmail" opens the app. */
  platform?: Platform;
  googleEnabled: boolean;
  /** Cloudflare Turnstile site key; null = no CAPTCHA. */
  captchaSiteKey: string | null;
  /** Final button ("Entrar", "Crear mi tarjeta"). */
  submitLabel: string;
  /** Focus the email field on arrival (only when it's empty: a prefilled one keeps the keyboard closed). */
  autoFocus?: boolean;
  /** Told the address (and the send's server timestamp) each time a code goes out. Should be stable (useCallback). */
  onCodeSent?: (email: string, sentAt: number) => void;
  /** Told which step is showing. Should be stable (useCallback). */
  onStepChange?: (step: "email" | "code") => void;
  /** Called when "Continuar con Google" is pressed. */
  onGoogle?: () => void;
}

type CodeState = Extract<AuthState, { step: "code" }>;

/**
 * Passwordless sign-in: email → 8-digit code, all on this screen. The code is
 * the fast path (iOS suggests it from Mail above the keyboard; on Android it
 * shows in the notification) and the email's button still works: this tab
 * notices and carries on.
 */
export function EmailCodeAuth(props: EmailCodeAuthProps) {
  const { initialEmail, initialError, initialState, continueTo, onCodeSent, onStepChange, autoFocus } = props;
  const [state, dispatch, pending] = useActionState<AuthState, FormData>(
    authAction,
    initialState ?? { step: "email", email: initialEmail, error: initialError },
  );

  // "Cambiar email" goes back locally; any new answer from the server ends it.
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setEditing(false);
  }

  const sentTo = state.step === "code" ? state.email : null;
  const sentAt = state.step === "code" ? state.sentAt : 0;
  useEffect(() => {
    if (sentTo) onCodeSent?.(sentTo, sentAt);
  }, [sentTo, sentAt, onCodeSent]);

  const onCodeStep = state.step === "code" && !editing;
  useEffect(() => {
    onStepChange?.(onCodeStep ? "code" : "email");
  }, [onCodeStep, onStepChange]);
  const goOn = useCallback(() => window.location.assign(continueTo), [continueTo]);
  // Paused while an answer is on its way: a successful code redirects by itself.
  useSignedInElsewhere(onCodeStep && !pending, goOn);

  if (onCodeStep) {
    return <CodeStep {...props} state={state as CodeState} dispatch={dispatch} pending={pending} onEditEmail={() => setEditing(true)} />;
  }
  const email = state.email ?? initialEmail ?? "";
  return (
    <EmailStep
      {...props}
      email={email}
      error={state.step === "email" ? state.error : undefined}
      state={state}
      dispatch={dispatch}
      pending={pending}
      focusInput={editing || Boolean(autoFocus && !email)}
    />
  );
}

interface EmailStepProps extends EmailCodeAuthProps {
  email: string;
  error?: string;
  state: AuthState;
  dispatch: (formData: FormData) => void;
  pending: boolean;
  focusInput: boolean;
}

function EmailStep({ next, continueTo, email, error, state, dispatch, pending, googleEnabled, captchaSiteKey, focusInput, onGoogle }: EmailStepProps) {
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(email);
  return (
    <div>
      <form action={dispatch} className="space-y-4">
        <input type="hidden" name="intent" value="send" />
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="text-sm font-medium text-ink-soft">Tu email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus={focusInput}
            readOnly={pending}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="tu@email.com"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className={inputClasses({ className: "mt-1.5" })}
            ref={inputRef}
          />
        </label>
        <EmailTypoHint
          email={value}
          onFix={(fixed) => {
            setValue(fixed);
            inputRef.current?.focus();
          }}
        />
        {error ? (
          <InlineError id={errorId} live>
            {error}
          </InlineError>
        ) : null}
        {captchaSiteKey ? <Turnstile siteKey={captchaSiteKey} action="login" resetKey={state} /> : null}
        <SubmitButton pendingLabel="Enviando el código…">Enviarme un código</SubmitButton>
      </form>

      {googleEnabled ? (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-line" /> o <span className="h-px flex-1 bg-line" />
          </div>
          <form action={signInWithGoogle} onSubmit={() => onGoogle?.()}>
            {/* Google comes back to the same place the waiting tab would. */}
            <input type="hidden" name="next" value={continueTo} />
            <GoogleButton />
          </form>
        </>
      ) : null}
    </div>
  );
}

function GoogleButton() {
  return (
    <SubmitButton
      variant="outline"
      pendingLabel="Conectando con Google…"
      icon={
        <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
          <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8Z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8Z" />
          <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
        </svg>
      }
    >
      Continuar con Google
    </SubmitButton>
  );
}

/** Seconds left before another email can be requested; restarts whenever `key` (the send) changes. */
function useSecondsLeft(key: number, seconds: number): number {
  const [left, setLeft] = useState<{ key: number; value: number } | null>(null);
  useEffect(() => {
    const until = Date.now() + seconds * 1000;
    let timer = 0;
    const tick = () => {
      const value = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLeft({ key, value });
      if (value === 0) window.clearInterval(timer);
    };
    const first = window.setTimeout(tick, 0);
    timer = window.setInterval(tick, 500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [key, seconds]);
  return left?.key === key ? left.value : seconds;
}

interface CodeStepProps extends EmailCodeAuthProps {
  state: CodeState;
  dispatch: (formData: FormData) => void;
  pending: boolean;
  onEditEmail: () => void;
}

function CodeStep({ state, dispatch, pending, onEditEmail, next, draft, from, via, submitLabel, captchaSiteKey, platform }: CodeStepProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  // Bumped on every answer, so the same error said twice is announced twice.
  const [answer, setAnswer] = useState(0);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setAnswer((n) => n + 1);
    if (state.rejected) setCode("");
  }
  // Straight to typing: when the screen appears, after another email and after a wrong code.
  useEffect(() => {
    inputRef.current?.focus();
  }, [state.sentAt]);
  useEffect(() => {
    if (state.rejected) inputRef.current?.focus();
  }, [state]);

  const statusId = useId();
  const errorId = useId();
  const secondsLeft = useSecondsLeft(state.sentAt, state.resendIn);
  const inbox = inboxFor(state.email, platform);

  return (
    <div className="animate-rise">
      <Notice
        id={statusId}
        tone="ok"
        title={state.resumed ? "Ya te enviamos un código" : "¡Código enviado!"}
        action={
          <button
            type="button"
            onClick={onEditEmail}
            className="-my-1.5 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <Pencil className="size-3.5" aria-hidden /> Cambiar email
          </button>
        }
      >
        {state.resumed ? "Lo mandamos a " : "Lo hemos mandado a "}
        <strong className="font-semibold text-ink [overflow-wrap:anywhere]">{state.email}</strong>
        {state.resumed
          ? " y sigue valiendo unos minutos. Mira también en spam o promociones."
          : ". Tarda unos segundos; mira también en spam o promociones."}
      </Notice>

      {state.notice ? (
        <Notice key={answer} tone="info" className="mt-3">
          {state.notice}
        </Notice>
      ) : null}

      {/* noValidate: a pasted "1234 5678" must still submit; the server keeps only the digits. */}
      <form ref={formRef} action={dispatch} noValidate className="mt-6 space-y-4">
        <input type="hidden" name="intent" value="verify" />
        <input type="hidden" name="email" value={state.email} />
        <input type="hidden" name="next" value={next} />
        {draft ? <input type="hidden" name="draft" value={draft} /> : null}
        {from ? <input type="hidden" name="from" value={from} /> : null}
        {from && via ? <input type="hidden" name="via" value={via} /> : null}
        <div>
          <p className="eyebrow mb-2" aria-hidden="true">
            Escribe el código de {LOGIN_CODE_LENGTH} cifras
          </p>
          <CodeInput
            name="code"
            length={LOGIN_CODE_LENGTH}
            value={code}
            onChange={setCode}
            onComplete={() => {
              if (!pending) formRef.current?.requestSubmit();
            }}
            readOnly={pending}
            // Red until they start typing the next attempt.
            invalid={Boolean(state.error) && code === ""}
            describedBy={state.error ? `${errorId} ${statusId}` : statusId}
            inputRef={inputRef}
            label={`Código de ${LOGIN_CODE_LENGTH} cifras`}
          />
        </div>
        {state.error ? (
          <InlineError key={answer} id={errorId} live>
            {state.error}
          </InlineError>
        ) : null}
        <SubmitButton pendingLabel="Comprobando…" disabled={code.length < LOGIN_CODE_LENGTH}>
          {submitLabel}
        </SubmitButton>
      </form>

      <form action={dispatch} className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <input type="hidden" name="intent" value="resend" />
        <input type="hidden" name="email" value={state.email} />
        <input type="hidden" name="next" value={next} />
        {captchaSiteKey && secondsLeft === 0 ? (
          <div className="w-full">
            <Turnstile siteKey={captchaSiteKey} action="login-resend" resetKey={state} />
          </div>
        ) : null}
        <ResendButton secondsLeft={secondsLeft} />
        {inbox?.app ? (
          // An app on this phone: a new tab would stay behind empty.
          <a
            href={inbox.url}
            className="inline-flex min-h-11 items-center gap-1 text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Abrir {inbox.name} <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        ) : inbox ? (
          <a
            href={inbox.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Abrir {inbox.name} <ArrowUpRight className="size-3.5" aria-hidden />
            <NewTabHint />
          </a>
        ) : null}
      </form>

      <p className="mt-6 border-t hairline pt-4 text-xs leading-relaxed text-muted">
        ¿Prefieres el botón del email? Si lo abres en este mismo dispositivo, esta pantalla continuará sola.
      </p>
    </div>
  );
}

function ResendButton({ secondsLeft }: { secondsLeft: number }) {
  const { pending } = useFormStatus();
  const waiting = secondsLeft > 0;
  return (
    <button
      type="submit"
      disabled={waiting || pending}
      className="inline-flex items-center gap-1.5 text-muted underline-offset-4 enabled:hover:text-ink enabled:hover:underline disabled:cursor-default"
    >
      {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
      {pending ? "Enviando otro…" : waiting ? `¿No te llega? Reenviar en ${formatCountdown(secondsLeft)}` : "¿No te llega? Reenviar código"}
    </button>
  );
}
