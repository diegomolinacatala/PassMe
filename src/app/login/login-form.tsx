"use client";

import { ArrowLeft, LoaderCircle, MailCheck } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { requestLoginCode, signInWithGoogle, verifyLoginCode, type LoginState } from "./actions";

interface LoginFormProps {
  next: string;
  googleEnabled: boolean;
  initialError?: string;
}

const INPUT =
  "h-13 w-full rounded-2xl border border-line bg-card px-4 text-base text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] outline-none focus:border-ink focus:shadow-[0_0_0_4px_rgb(20_20_20/0.06)]";

export function LoginForm({ next, googleEnabled, initialError }: LoginFormProps) {
  const [emailState, sendEmail, sending] = useActionState<LoginState, FormData>(requestLoginCode, {
    step: "email",
    error: initialError,
  });
  const [codeState, verifyCode, verifying] = useActionState<LoginState, FormData>(verifyLoginCode, { step: "email" });

  const onCodeStep = emailState.step === "code" && codeState.step !== "email";
  const email = emailState.step === "code" ? emailState.email : (emailState.email ?? "");

  if (onCodeStep) {
    const error = codeState.step === "code" ? codeState.error : undefined;
    return (
      <div className="animate-rise">
        <div className="flex items-start gap-3 rounded-2xl bg-signal-wash px-4 py-3.5 text-sm text-signal-deep">
          <MailCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            Revisa <strong className="font-semibold">{email}</strong>. Pulsa el enlace del email o escribe aquí el código.
          </p>
        </div>

        <form action={verifyCode} className="mt-6 space-y-4">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="eyebrow">Código de acceso</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={12}
              required
              autoFocus
              placeholder="123456"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "code-error" : undefined}
              className={`${INPUT} mt-2 text-center font-mono text-2xl tracking-[0.4em]`}
            />
          </label>
          {error ? (
            <p id="code-error" role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={verifying}>
            {verifying ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
            Entrar
          </Button>
        </form>

        <form action={sendEmail} className="mt-4 flex items-center justify-between text-sm">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next} />
          <a href={`/login?next=${encodeURIComponent(next)}`} className="inline-flex items-center gap-1 text-muted hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Otro email
          </a>
          <button type="submit" className="text-muted underline-offset-4 hover:text-ink hover:underline" disabled={sending}>
            {sending ? "Enviando…" : "Reenviar email"}
          </button>
        </form>
      </div>
    );
  }

  const error = emailState.step === "email" ? emailState.error : undefined;
  return (
    <div>
      <form action={sendEmail} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="eyebrow">Tu email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            autoFocus
            defaultValue={email}
            placeholder="tu@empresa.com"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "email-error" : undefined}
            className={`${INPUT} mt-2`}
          />
        </label>
        {error ? (
          <p id="email-error" role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={sending}>
          {sending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
          Enviarme un enlace de acceso
        </Button>
      </form>

      {googleEnabled ? (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-line" /> o <span className="h-px flex-1 bg-line" />
          </div>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="outline" size="lg" className="w-full">
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8Z" />
                <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
                <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8Z" />
                <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
              </svg>
              Continuar con Google
            </Button>
          </form>
        </>
      ) : null}

      <p className="mt-6 text-xs leading-relaxed text-muted">
        Sin contraseñas: te enviamos un enlace de un solo uso. Si es tu primera vez, se crea tu cuenta automáticamente. Al
        continuar aceptas nuestra{" "}
        <a href="/privacidad" className="underline underline-offset-2 hover:text-ink">
          política de privacidad
        </a>
        .
      </p>
    </div>
  );
}
