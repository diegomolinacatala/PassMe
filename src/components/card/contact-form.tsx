"use client";

import { ArrowRight, CircleCheck, HandHeart } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { submitContactAction, type ContactFormState, type ContactFormValues, type SentDetails } from "@/app/u/[slug]/actions";
import { buttonClasses } from "@/components/ui/button";
import { rememberDetails } from "@/lib/card/draft-storage";
import { firstName as firstNameOf } from "@/lib/card/first-name";
import { createPath, parseVia } from "@/lib/card/paths";
import { ActionPanel, useCardPage } from "./card-page-context";
import { clearDraft } from "./contact-draft";
import { lazyPanel, preloadWhenIdle } from "./lazy-panel";

// The fields are a separate download: it starts when the visitor's finger or pointer gets near the
// row (or a few seconds after the page settles), and most scanners never need it.
const { Panel: ContactFields, preload: preloadFields } = lazyPanel(() => import("./contact-fields").then((module) => module.ContactFields), { boxed: true });

interface ContactFormProps {
  slug: string;
  ownerName: string;
  source: string;
  captchaSiteKey: string | null;
}

/** When the request never reached the server (a dropped connection, a deploy in between). */
const CONNECTION_ERROR = "No hemos podido conectar. Inténtalo de nuevo.";

/** What the form held, so a failed send can put it back (React resets uncontrolled fields after a submission). */
function valuesOf(formData: FormData): ContactFormValues {
  const text = (name: string, max: number) => String(formData.get(name) ?? "").slice(0, max);
  return {
    name: text("name", 200),
    email: text("email", 300),
    phone: text("phone", 60),
    company: text("company", 200),
    message: text("message", 1000),
    consent: formData.get("consent") === "on",
  };
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
    async (previous, formData) => {
      try {
        return await submitContactAction(slug, source, previous, formData);
      } catch {
        // The request itself failed (offline, or the page is older than the server): say so and keep what was typed.
        return { status: "error", message: CONNECTION_ERROR, values: valuesOf(formData) };
      }
    },
    { status: "idle" },
  );
  const firstName = firstNameOf(ownerName);

  useEffect(() => preloadWhenIdle(preloadFields), []);

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
      onWarm={preloadFields}
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
