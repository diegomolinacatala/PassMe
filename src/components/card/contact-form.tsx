"use client";

import { CircleCheck, HandHeart, LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { submitContactAction, type ContactFormState } from "@/app/u/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Turnstile } from "@/components/ui/turnstile";
import { CONTACT_LIMITS } from "@/lib/card/contact";
import { cn } from "@/lib/cn";

const INPUT =
  "w-full rounded-xl border border-line bg-paper/60 px-3.5 text-[0.95rem] text-ink placeholder:text-muted/60 outline-none transition-[border-color,box-shadow] duration-200 hover:border-line-strong focus:border-ink focus:bg-card focus:shadow-[0_0_0_4px_rgb(20_20_20/0.06)] aria-[invalid=true]:border-danger";

interface ContactFormProps {
  slug: string;
  ownerName: string;
  source: string;
  captchaSiteKey: string | null;
}

interface FieldProps {
  label: string;
  error?: string;
  optional?: boolean;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}

function Field({ label, error, optional, children }: FieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink-soft">
        {label}
        {optional ? <span className="font-mono text-[10px] tracking-wide text-muted uppercase">Opcional</span> : null}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined })}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Confirmation that takes focus, so screen readers announce it and keyboard users aren't lost. */
function SentMessage({ firstName, demo }: { firstName: string; demo: boolean }) {
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div role="status" className="animate-rise rounded-[24px] border hairline bg-card px-5 py-5 text-center">
      <CircleCheck className="mx-auto size-7 text-ok" aria-hidden />
      <p ref={heading} tabIndex={-1} className="mt-2 font-display text-2xl leading-tight outline-none">
        {firstName} ya tiene <em className="text-signal">tu contacto.</em>
      </p>
      <p className="mt-1 text-sm text-muted">
        {demo ? "Es la tarjeta de ejemplo: esta vez no se ha enviado nada." : "Te escribirá cuando pueda."}
      </p>
    </div>
  );
}

/**
 * "Te dejo mi contacto": the visitor leaves their details for the card owner.
 * Collapsed by default so the card stays the star of the page.
 */
export function ContactForm({ slug, ownerName, source, captchaSiteKey }: ContactFormProps) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<ContactFormState, FormData>(
    submitContactAction.bind(null, slug, source),
    { status: "idle" },
  );
  const firstName = ownerName.split(/\s+/)[0] || ownerName;
  const errors = state.status === "error" ? (state.errors ?? {}) : {};
  const values = state.status === "error" ? state.values : undefined;

  if (state.status === "sent") return <SentMessage firstName={firstName} demo={Boolean(state.demo)} />;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-4 rounded-[24px] border border-dashed border-line-strong bg-card/60 px-5 py-4 text-left transition-colors duration-300 hover:border-ink hover:bg-card"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-signal-wash text-signal-deep transition-transform duration-500 group-hover:-rotate-6">
          <HandHeart className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">Déjale tu contacto a {firstName}</span>
          <span className="block text-sm text-muted">Así también tiene el tuyo. Tardas 20 segundos.</span>
        </span>
      </button>
    );
  }

  return (
    <form
      action={submit}
      className="relative animate-rise space-y-4 rounded-[24px] border hairline bg-card px-5 py-5"
      noValidate
    >
      <div>
        <p className="eyebrow">Te dejo mi contacto</p>
        <p className="mt-1 text-sm text-muted">{firstName} recibirá lo que escribas aquí. Nada más.</p>
      </div>

      <Field label="Nombre" error={errors.name}>
        {(props) => (
          <input
            {...props}
            name="name"
            required
            // The form only mounts after "Déjale tu contacto" is pressed: continue right there.
            autoFocus
            defaultValue={values?.name}
            maxLength={CONTACT_LIMITS.name}
            autoComplete="name"
            className={cn(INPUT, "h-11")}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" error={errors.email}>
          {(props) => (
            <input
              {...props}
              name="email"
              type="email"
              inputMode="email"
              defaultValue={values?.email}
              maxLength={CONTACT_LIMITS.email}
              autoComplete="email"
              className={cn(INPUT, "h-11")}
            />
          )}
        </Field>
        <Field label="Teléfono" error={errors.phone}>
          {(props) => (
            <input
              {...props}
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={values?.phone}
              maxLength={CONTACT_LIMITS.phone}
              autoComplete="tel"
              className={cn(INPUT, "h-11")}
            />
          )}
        </Field>
      </div>
      <Field label="Empresa" optional error={errors.company}>
        {(props) => (
          <input
            {...props}
            name="company"
            defaultValue={values?.company}
            maxLength={CONTACT_LIMITS.company}
            autoComplete="organization"
            className={cn(INPUT, "h-11")}
          />
        )}
      </Field>
      <Field label="Mensaje" optional error={errors.message}>
        {(props) => (
          <textarea
            {...props}
            name="message"
            rows={3}
            defaultValue={values?.message}
            maxLength={CONTACT_LIMITS.message}
            placeholder="Nos conocimos en…"
            className={cn(INPUT, "resize-y py-2.5")}
          />
        )}
      </Field>

      {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
      <div aria-hidden="true" className="absolute top-0 left-0 h-px w-px overflow-hidden opacity-0">
        <label>
          Web
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex items-start gap-3 text-sm leading-snug text-ink-soft">
        <input
          type="checkbox"
          name="consent"
          required
          defaultChecked={values?.consent}
          aria-invalid={Boolean(errors.consent)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]"
        />
        <span>
          Acepto que {ownerName} reciba estos datos para ponerse en contacto conmigo.{" "}
          <a href="/privacidad#contactos" className="underline underline-offset-2 hover:text-ink">
            Más info
          </a>
        </span>
      </label>
      {errors.consent ? <p className="-mt-2 text-xs text-danger">{errors.consent}</p> : null}

      {captchaSiteKey ? <Turnstile siteKey={captchaSiteKey} action="contact" resetKey={state} /> : null}

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
        Enviar mi contacto
      </Button>
    </form>
  );
}
