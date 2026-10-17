"use client";

import { Plus } from "lucide-react";
import { startTransition, useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ContactFormState } from "@/app/u/[slug]/actions";
import { Field, InlineError, inputClasses } from "@/components/ui/field";
import { NewTabHint } from "@/components/ui/new-tab-hint";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { Turnstile } from "@/components/ui/turnstile";
import { CONTACT_LIMITS, CONTACT_ONE_OF_ERROR } from "@/lib/card/contact-info";
import { PanelCloseButton } from "./card-page-context";
import { readDraft, writeDraft, type DraftFields } from "./contact-draft";

/**
 * The fields of "Déjale tu contacto". Their own module, loaded when the panel
 * is about to open (see contact-form.tsx): most people never open it.
 */

/** The message counter appears when it's getting close to the limit. */
const MESSAGE_COUNTER_FROM = 400;

interface ContactFieldsProps {
  slug: string;
  ownerName: string;
  firstName: string;
  state: ContactFormState;
  submit: (formData: FormData) => void;
  pending: boolean;
  captchaSiteKey: string | null;
}

export function ContactFields({ slug, ownerName, firstName, state, submit, pending, captchaSiteKey }: ContactFieldsProps) {
  const errors = state.status === "error" ? (state.errors ?? {}) : {};
  const values = state.status === "error" ? state.values : undefined;
  // Mounted when the panel opens: start from what was typed before (this tab), else from the last attempt.
  const [initial] = useState<Partial<DraftFields>>(() => ({ ...values, ...readDraft(slug) }));
  const [extras, setExtras] = useState(() => Boolean(initial.company || initial.message || errors.company || errors.message));
  const [focusExtras, setFocusExtras] = useState(false);
  const [messageLength, setMessageLength] = useState(() => (initial.message ?? "").length);
  const form = useRef<HTMLFormElement>(null);
  const company = useRef<HTMLInputElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const oneOfId = `${id}-one-of`;
  const consentErrorId = `${id}-consent`;
  // Neither phone nor email: one message for both fields, both marked.
  const oneOf = errors.phone === CONTACT_ONE_OF_ERROR && errors.email === CONTACT_ONE_OF_ERROR;

  // A rejected submission: take the keyboard (and screen reader) to the first field to fix.
  useEffect(() => {
    if (state.status !== "error") return;
    const target = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form.current?.querySelector<HTMLElement>("[data-form-error]");
    target?.focus();
  }, [state]);

  useEffect(() => {
    if (focusExtras) company.current?.focus();
  }, [focusExtras]);

  // Submitting by hand skips React's automatic form reset: after an error, what was typed stays.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => submit(formData));
  }

  return (
    <form
      ref={form}
      action={submit}
      onSubmit={onSubmit}
      onChange={(event) => writeDraft(slug, event.currentTarget)}
      aria-labelledby={titleId}
      className="relative animate-rise space-y-4 rounded-panel border hairline bg-card px-5 py-5"
      noValidate
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-2xl leading-tight">
            Déjale tu contacto a {firstName}
          </h2>
          <p className="mt-1 text-sm text-muted">Con el móvil o el email basta.</p>
        </div>
        <PanelCloseButton panel="contact" />
      </div>

      <Field label="Nombre" error={errors.name}>
        {(props) => (
          <input
            {...props}
            name="name"
            required
            // The form only mounts after "Déjale tu contacto" is pressed: continue right there.
            autoFocus
            defaultValue={initial.name}
            maxLength={CONTACT_LIMITS.name}
            autoComplete="name"
            className={inputClasses()}
          />
        )}
      </Field>
      <Field label="Móvil" error={oneOf ? undefined : errors.phone} describedBy={oneOf ? oneOfId : undefined}>
        {(props) => (
          <input
            {...props}
            aria-invalid={props["aria-invalid"] || oneOf}
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={initial.phone}
            maxLength={CONTACT_LIMITS.phone}
            autoComplete="tel"
            className={inputClasses()}
          />
        )}
      </Field>
      <Field label="Email" error={oneOf ? undefined : errors.email} describedBy={oneOf ? oneOfId : undefined}>
        {(props) => (
          <input
            {...props}
            aria-invalid={props["aria-invalid"] || oneOf}
            name="email"
            type="email"
            inputMode="email"
            defaultValue={initial.email}
            maxLength={CONTACT_LIMITS.email}
            autoComplete="email"
            className={inputClasses()}
          />
        )}
      </Field>
      {oneOf ? (
        <InlineError id={oneOfId} className="-mt-2">
          {CONTACT_ONE_OF_ERROR}
        </InlineError>
      ) : null}

      {extras ? (
        <>
          <Field label="Empresa" optional error={errors.company}>
            {(props) => (
              <input
                {...props}
                ref={company}
                name="company"
                defaultValue={initial.company}
                maxLength={CONTACT_LIMITS.company}
                autoComplete="organization"
                className={inputClasses()}
              />
            )}
          </Field>
          <Field
            label="Mensaje"
            optional
            error={errors.message}
            aside={
              messageLength >= MESSAGE_COUNTER_FROM ? (
                <span className="tabular-nums">
                  {messageLength}/{CONTACT_LIMITS.message}
                </span>
              ) : null
            }
          >
            {(props) => (
              <textarea
                {...props}
                name="message"
                rows={3}
                defaultValue={initial.message}
                maxLength={CONTACT_LIMITS.message}
                placeholder="Nos conocimos en…"
                onChange={(event) => setMessageLength(event.currentTarget.value.length)}
                className={inputClasses({ size: "multiline" })}
              />
            )}
          </Field>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setExtras(true);
            setFocusExtras(true);
          }}
          className="-my-1 inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          <Plus className="size-4" aria-hidden />
          Añadir empresa o un mensaje
        </button>
      )}

      {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
      <div aria-hidden="true" className="absolute top-0 left-0 h-px w-px overflow-hidden opacity-0">
        <label>
          Web
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm leading-snug text-ink-soft">
        <input
          type="checkbox"
          name="consent"
          required
          defaultChecked={values?.consent}
          aria-invalid={Boolean(errors.consent)}
          aria-describedby={errors.consent ? consentErrorId : undefined}
          className="size-5 shrink-0 accent-[var(--color-ink)]"
        />
        <span>
          Acepto que {ownerName} reciba estos datos para ponerse en contacto conmigo.{" "}
          <a href="/privacidad#contactos" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
            Más info
            <NewTabHint />
          </a>
        </span>
      </label>

      {captchaSiteKey ? <Turnstile siteKey={captchaSiteKey} action="contact" resetKey={state} /> : null}

      {state.status === "error" ? (
        <div data-form-error tabIndex={-1} className="outline-none">
          <Notice tone="error">{state.message}</Notice>
        </div>
      ) : null}

      <div className="space-y-2">
        {/* Next to the button, where the eye is when sending fails. */}
        {errors.consent ? <InlineError id={consentErrorId}>{errors.consent}</InlineError> : null}
        <SubmitButton pending={pending} pendingLabel="Enviando…">
          Dejarle mi contacto
        </SubmitButton>
      </div>
    </form>
  );
}
