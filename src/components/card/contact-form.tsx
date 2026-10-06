"use client";

import { ArrowRight, CircleCheck, HandHeart } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { submitContactAction, type ContactFormState, type SentDetails } from "@/app/u/[slug]/actions";
import { buttonClasses } from "@/components/ui/button";
import { Field, InlineError, inputClasses } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { Turnstile } from "@/components/ui/turnstile";
import { CONTACT_LIMITS } from "@/lib/card/contact";
import { rememberDetails } from "@/lib/card/draft-storage";
import { createPath, parseVia } from "@/lib/card/quick";

interface ContactFormProps {
  slug: string;
  ownerName: string;
  source: string;
  captchaSiteKey: string | null;
}

/** Confirmation that takes focus, so screen readers announce it and keyboard users aren't lost. */
function SentMessage({
  firstName,
  slug,
  source,
  demo,
  details,
}: {
  firstName: string;
  slug: string;
  source: string;
  demo: boolean;
  details?: SentDetails;
}) {
  const via = parseVia(source);
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => heading.current?.focus(), []);
  // Any "create mine" button on the page (top bar, dark block) now starts with these details.
  useEffect(() => {
    if (details) {
      rememberDetails({ fullName: details.name, email: details.email, phone: details.phone, company: details.company }, slug, via);
    }
  }, [details, slug, via]);
  return (
    <div role="status" className="animate-rise rounded-panel border hairline bg-card px-5 py-5 text-center">
      <CircleCheck className="mx-auto size-7 text-ok" aria-hidden />
      <p ref={heading} tabIndex={-1} className="mt-2 font-display text-2xl leading-tight outline-none">
        {firstName} ya tiene <em className="text-signal">tu contacto.</em>
      </p>
      <p className="mt-1 text-sm text-muted">
        {demo ? "Es la tarjeta de ejemplo: esta vez no se ha enviado nada." : "Te escribirá cuando pueda."}
      </p>
      <div className="mt-5 border-t hairline pt-5">
        <p className="text-sm text-ink-soft">¿Y si te haces tu propia tarjeta? Ya tenemos tus datos.</p>
        <Link
          href={createPath(slug, via)}
          className={buttonClasses({ variant: "signal", className: "group mt-3" })}
        >
          Crear la mía con estos datos
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/**
 * "Déjale tu contacto": the visitor leaves their details for the card owner.
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
  const form = useRef<HTMLFormElement>(null);

  // A rejected submission: take the keyboard (and screen reader) to the first field to fix.
  useEffect(() => {
    if (state.status !== "error") return;
    const target = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form.current?.querySelector<HTMLElement>("[data-form-error]");
    target?.focus();
  }, [state]);

  // Submitting by hand skips React's automatic form reset: after an error, what was typed stays.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => submit(formData));
  }

  if (state.status === "sent") {
    return <SentMessage firstName={firstName} slug={slug} source={source} demo={Boolean(state.demo)} details={state.details} />;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-4 rounded-panel border border-dashed border-line-strong bg-card/60 px-5 py-4 text-left transition-colors duration-300 hover:border-ink hover:bg-card"
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
      ref={form}
      action={submit}
      onSubmit={onSubmit}
      className="relative animate-rise space-y-4 rounded-panel border hairline bg-card px-5 py-5"
      noValidate
    >
      <div>
        <h2 className="font-display text-2xl leading-tight">Déjale tu contacto a {firstName}</h2>
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
            className={inputClasses()}
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
              className={inputClasses()}
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
              className={inputClasses()}
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
            className={inputClasses()}
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
            className={inputClasses({ size: "multiline" })}
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
      {errors.consent ? <InlineError className="-mt-2">{errors.consent}</InlineError> : null}

      {captchaSiteKey ? <Turnstile siteKey={captchaSiteKey} action="contact" resetKey={state} /> : null}

      {state.status === "error" ? (
        <div data-form-error tabIndex={-1} className="outline-none">
          <Notice tone="error">{state.message}</Notice>
        </div>
      ) : null}

      <SubmitButton pending={pending} pendingLabel="Enviando…">
        Dejarle mi contacto
      </SubmitButton>
    </form>
  );
}
