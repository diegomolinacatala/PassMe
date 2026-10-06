"use client";

import { ArrowRight, CircleCheck, HandHeart, Plus } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { submitContactAction, type ContactFormState, type ContactFormValues, type SentDetails } from "@/app/u/[slug]/actions";
import { buttonClasses } from "@/components/ui/button";
import { Field, InlineError, inputClasses } from "@/components/ui/field";
import { NewTabHint } from "@/components/ui/new-tab-hint";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { Turnstile } from "@/components/ui/turnstile";
import { CONTACT_LIMITS, CONTACT_ONE_OF_ERROR } from "@/lib/card/contact";
import { rememberDetails } from "@/lib/card/draft-storage";
import { createPath, parseVia } from "@/lib/card/quick";
import { firstName as firstNameOf } from "@/lib/meetings/model";
import { ActionPanel, PanelCloseButton, useCardPage } from "./card-page-context";

interface ContactFormProps {
  slug: string;
  ownerName: string;
  source: string;
  captchaSiteKey: string | null;
}

/** The message counter appears when it's getting close to the limit. */
const MESSAGE_COUNTER_FROM = 400;

type DraftFields = Pick<ContactFormValues, "name" | "phone" | "email" | "company" | "message">;
const DRAFT_FIELDS = ["name", "phone", "email", "company", "message"] as const;

const draftKey = (slug: string) => `passme:contact-draft:${slug}`;

/**
 * What was typed survives a trip to "Más info" (another tab) or closing the
 * panel, until the tab is closed. Storage may be blocked: then it just isn't kept.
 */
function readDraft(slug: string): Partial<DraftFields> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(draftKey(slug)) ?? "null");
    if (!parsed || typeof parsed !== "object") return {};
    const record = parsed as Record<string, unknown>;
    const draft: Partial<DraftFields> = {};
    for (const field of DRAFT_FIELDS) {
      const value = record[field];
      if (typeof value === "string") draft[field] = value.slice(0, CONTACT_LIMITS[field]);
    }
    return draft;
  } catch {
    return {};
  }
}

function writeDraft(slug: string, form: HTMLFormElement): void {
  const data = new FormData(form);
  const draft: Partial<DraftFields> = {};
  for (const field of DRAFT_FIELDS) {
    const value = data.get(field);
    if (typeof value === "string" && value) draft[field] = value;
  }
  try {
    sessionStorage.setItem(draftKey(slug), JSON.stringify(draft));
  } catch {
    // Storage blocked (private mode, embedded browsers): nothing to keep.
  }
}

function clearDraft(slug: string): void {
  try {
    sessionStorage.removeItem(draftKey(slug));
  } catch {
    // Same as above.
  }
}

/** Confirmation that takes focus, so screen readers announce it and keyboard users aren't lost. */
function SentMessage({
  firstName,
  slug,
  source,
  demo,
  details,
  saved,
}: {
  firstName: string;
  slug: string;
  source: string;
  demo: boolean;
  details?: SentDetails;
  /** "Guardar contacto" is done: creating a card becomes the page's main action. */
  saved: boolean;
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
  const reply = details?.phone ? `${firstName} te llamará o te escribirá cuando pueda.` : `${firstName} te escribirá cuando pueda.`;
  return (
    <div role="status" className="animate-rise rounded-panel border hairline bg-card px-5 py-5 text-center">
      <CircleCheck className="mx-auto size-7 text-ok" aria-hidden />
      <p ref={heading} tabIndex={-1} className="mt-2 font-display text-2xl leading-tight outline-none">
        {firstName} ya tiene <em className="text-signal">tu contacto.</em>
      </p>
      <p className="mt-1 text-sm text-muted">{reply}</p>
      {demo ? <p className="mt-1 text-sm text-muted">Es la tarjeta de ejemplo: esta vez no se ha enviado nada.</p> : null}
      <div className="mt-5 border-t hairline pt-5">
        <p className="text-sm text-ink-soft">
          ¿Te haces tu propia tarjeta? <strong className="font-medium text-ink">Empieza con lo que acabas de escribir.</strong>
        </p>
        <Link href={createPath(slug, via)} className={buttonClasses({ variant: saved ? "signal" : "ink", className: "group mt-3" })}>
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
  const { sent, markSent, saved } = useCardPage();
  const [state, submit, pending] = useActionState<ContactFormState, FormData>(
    submitContactAction.bind(null, slug, source),
    { status: "idle" },
  );
  const firstName = firstNameOf(ownerName);

  useEffect(() => {
    if (state.status !== "sent") return;
    clearDraft(slug);
    markSent("contact");
  }, [state.status, slug, markSent]);

  // A meeting proposal already gave them these details.
  if (sent.meeting) return null;
  if (state.status === "sent") {
    return <SentMessage firstName={firstName} slug={slug} source={source} demo={Boolean(state.demo)} details={state.details} saved={saved} />;
  }

  return (
    <ActionPanel
      panel="contact"
      id="dejar-contacto"
      icon={<HandHeart className="size-5" aria-hidden />}
      title={`Déjale tu contacto a ${firstName}`}
      subtitle="Así también tiene el tuyo. Tardas 20 segundos."
    >
      <ContactFields
        slug={slug}
        ownerName={ownerName}
        firstName={firstName}
        state={state}
        submit={submit}
        pending={pending}
        captchaSiteKey={captchaSiteKey}
      />
    </ActionPanel>
  );
}

interface ContactFieldsProps {
  slug: string;
  ownerName: string;
  firstName: string;
  state: ContactFormState;
  submit: (formData: FormData) => void;
  pending: boolean;
  captchaSiteKey: string | null;
}

function ContactFields({ slug, ownerName, firstName, state, submit, pending, captchaSiteKey }: ContactFieldsProps) {
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
