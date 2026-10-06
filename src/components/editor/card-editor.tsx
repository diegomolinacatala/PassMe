"use client";

import { Plus, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { saveCardAction } from "@/app/dashboard/actions";
import { InlineError } from "@/components/ui/field";
import { describeErrors } from "@/lib/card/save-errors";
import { passNameOverflows } from "@/lib/card/name";
import { LIMITS, type FieldErrors } from "@/lib/card/schema";
import type { OwnerCard } from "@/lib/card/types";
import type { ContactRequest } from "@/lib/card/contact";
import { isPlaceholderSlug, suggestSlug } from "@/lib/card/slug";
import type { CardStats } from "@/lib/data/cards";
import { needsOwnerAnswer, unseenContacts } from "@/lib/pending";
import { cn } from "@/lib/cn";
import type { Platform } from "@/lib/platform";
import { AccountPanel } from "./account-panel";
import { AvatarField } from "./avatar-field";
import { ContactsPanel } from "./contacts-panel";
import { DesignField } from "./design-field";
import { EditorIndex, type IndexEntry } from "./editor-index";
import { Section, SwitchRow, TextField } from "./fields";
import { LinksEditor } from "./links-editor";
import { MeetingsPanel, type MeetingItem } from "./meetings-panel";
import { PendingNotices } from "./pending-notices";
import { PreviewDock } from "./preview-dock";
import { PreviewPanel } from "./preview-panel";
import { WelcomeContext } from "./welcome-panel";
import { QuickActions } from "./quick-actions";
import { SaveBar, useEditorScrollPadding, type SaveStatus } from "./save-bar";
import { sectionLayout, SECTION_KEYS, type SectionKey } from "./sections";
import { SlugField } from "./slug-field";
import { StatsPanel } from "./stats-panel";
import {
  draftFromCard,
  draftToInput,
  draftToPublicCard,
  useCardDraft,
  type CardDraft,
  type TextField as DraftTextField,
} from "./use-card-draft";
import { WalletPanel, type WalletAvailability } from "./wallet-panel";

interface CardEditorProps {
  initialCard: OwnerCard;
  stats: CardStats;
  contacts: { available: boolean; requests: ContactRequest[]; /** Last "Ver" on the contacts notice (cookie). */ seenAt: string | null };
  meetings: { available: boolean; items: MeetingItem[] };
  wallet: WalletAvailability;
  /** This device (from the User-Agent): which wallet button to offer. */
  platform: Platform;
  siteUrl: string;
  email: string | null;
  demo: boolean;
  /** Shown above everything (the welcome for a card that was just created). */
  welcome?: ReactNode;
}

/** How long "Guardado" stays on screen before the bar slides away. */
const SAVED_NOTICE_MS = 3000;
/** How long "Cambios descartados · Deshacer" stays. */
const DISCARDED_NOTICE_MS = 8000;

/** Brings the first (or the next) field marked invalid into view and focuses it. */
function focusInvalid(root: HTMLElement | null, after?: Element | null) {
  const fields = Array.from(root?.querySelectorAll<HTMLElement>('[aria-invalid="true"]') ?? []);
  if (fields.length === 0) return;
  const index = after ? fields.findIndex((field) => field === after) : -1;
  const target = fields[(index + 1) % fields.length]!;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
}

export function CardEditor({ initialCard, stats, contacts, meetings, wallet, platform, siteUrl, email, demo, welcome }: CardEditorProps) {
  const initialDraft = useMemo(() => draftFromCard(initialCard), [initialCard]);
  const editor = useCardDraft(initialDraft);
  const { draft, dirty } = editor;
  // The saved slug is always acceptable (the demo card uses the reserved "demo" slug).
  const errors: FieldErrors = useMemo(() => {
    if (draft.slug !== initialCard.slug || !editor.errors.slug) return editor.errors;
    const rest = { ...editor.errors };
    delete rest.slug;
    return rest;
  }, [draft.slug, editor.errors, initialCard.slug]);

  const [savedSlug, setSavedSlug] = useState(initialCard.slug);
  const [savedPublished, setSavedPublished] = useState(initialCard.isPublished);
  const [savedName, setSavedName] = useState(initialCard.fullName);
  const [savedAcceptsContacts, setSavedAcceptsContacts] = useState(initialCard.acceptsContactRequests);
  const [savedAcceptsMeetings, setSavedAcceptsMeetings] = useState(initialCard.acceptsMeetingRequests);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  // Server errors belong to the exact draft that was submitted; any edit clears them.
  const [serverResult, setServerResult] = useState<{ draft: CardDraft; errors: FieldErrors } | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [saving, startSaving] = useTransition();
  const root = useRef<HTMLElement>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  // Open from the start when the card already uses them; once open, it stays open (clearing a field doesn't hide it).
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(() => Boolean(initialCard.location || initialCard.pronouns));
  const moreDetails = useRef<HTMLDivElement>(null);
  const mobilePreview = useRef<HTMLDivElement>(null);
  const welcomeContext = useMemo(
    () => ({
      onDismiss: () => {
        setWelcomeOpen(false);
        // Once the title is back to an H1 (a new element), it takes the focus.
        requestAnimationFrame(() => document.getElementById("editor-title")?.focus());
      },
    }),
    [],
  );
  useEditorScrollPadding();
  // Bumped on every save that fails validation: the effect below takes the person to the field.
  const [errorJump, setErrorJump] = useState(0);

  const siteHost = siteUrl.replace(/^https?:\/\//, "");
  // Built from the saved slug: links and QRs never point at an unsaved one.
  const publicUrl = (source: "qr" | "share") => `${siteUrl}/u/${encodeURIComponent(savedSlug)}?src=${source}`;
  const preview = useMemo(() => draftToPublicCard(draft), [draft]);
  const errorCount = Object.keys(errors).length;
  const serverErrors: FieldErrors = serverResult && serverResult.draft === draft ? serverResult.errors : {};

  const fieldError = (field: string) =>
    serverErrors[field] ?? ((submitted || touched.has(field)) && errors[field] ? errors[field] : undefined);
  const touch = (field: string) => setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  const save = useCallback(() => {
    setSubmitted(true);
    if (errorCount > 0) {
      setStatus({ kind: "error", message: describeErrors(errors, draft) });
      setErrorJump((n) => n + 1);
      return;
    }
    if (demo) {
      editor.markSaved(draft);
      setStatus({ kind: "demo" });
      return;
    }
    startSaving(async () => {
      const result = await saveCardAction(draftToInput(draft));
      if (result.ok) {
        editor.markSaved(draftFromCard(result.card));
        setSavedSlug(result.card.slug);
        setSavedPublished(result.card.isPublished);
        setSavedName(result.card.fullName);
        setSavedAcceptsContacts(result.card.acceptsContactRequests);
        setSavedAcceptsMeetings(result.card.acceptsMeetingRequests);
        setServerResult(null);
        setSubmitted(false);
        setStatus(result.designPending ? { kind: "partial" } : { kind: "saved", at: Date.now() });
      } else {
        setServerResult({ draft, errors: result.errors });
        setStatus({ kind: "error", message: describeErrors(result.errors, draft) });
        setErrorJump((n) => n + 1);
      }
    });
  }, [demo, draft, editor, errorCount, errors]);

  // After the fields re-render with aria-invalid, go to the first one.
  useEffect(() => {
    if (errorJump > 0) focusInvalid(root.current);
  }, [errorJump]);

  // "Guardado" says its piece and the bar goes away.
  useEffect(() => {
    if (status.kind !== "saved" && status.kind !== "demo" && status.kind !== "discarded") return;
    const delay = status.kind === "discarded" ? DISCARDED_NOTICE_MS : SAVED_NOTICE_MS;
    const timer = window.setTimeout(() => setStatus({ kind: "idle" }), delay);
    return () => window.clearTimeout(timer);
  }, [status]);

  // One tap back to the saved card; "Deshacer" brings the discarded changes back.
  const discard = useCallback(() => {
    setStatus({ kind: "discarded", draft });
    editor.discard();
    setTouched(new Set());
    setSubmitted(false);
    setServerResult(null);
  }, [draft, editor]);
  const undoDiscard = useCallback(() => {
    if (status.kind !== "discarded") return;
    editor.replaceDraft(status.draft);
    setStatus({ kind: "idle" });
  }, [editor, status]);

  // Cmd/Ctrl+S saves; warn before leaving with unsaved changes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) save();
      }
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty) e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty, save, saving]);

  const textField = (field: DraftTextField, label: string, max: number, extra: Partial<Parameters<typeof TextField>[0]> = {}) => (
    <TextField
      label={label}
      value={draft[field]}
      onChange={(v) => editor.setField(field, v)}
      onBlur={() => touch(field)}
      error={fieldError(field)}
      maxLength={max}
      optional={!extra.required}
      {...extra}
    />
  );

  const blockedReason = !savedName
    ? "Añade tu nombre y guarda para poder generar el pase."
    : dirty
      ? "Tienes cambios sin guardar: guarda para que el pase los incluya."
      : null;

  // Where each section goes, and the index to jump between them (D6 b: one page, no tabs).
  const layout = useMemo(
    () => sectionLayout({ reuniones: meetings.items.length > 0, contactos: contacts.requests.length > 0 }),
    [meetings.items.length, contacts.requests.length],
  );
  const indexEntries: IndexEntry[] = useMemo(() => {
    const badges: Partial<Record<SectionKey, number>> = {
      reuniones: meetings.items.filter(({ view }) => needsOwnerAnswer(view)).length,
      contactos: unseenContacts(contacts.requests, contacts.seenAt).length,
    };
    return SECTION_KEYS.map((key) => ({ ...layout[key], badge: badges[key] }));
  }, [contacts.requests, contacts.seenAt, layout, meetings.items]);
  const sectionProps = (key: SectionKey) => {
    const { id, title, number, mobileNumber, orderClass } = layout[key];
    return { anchor: id, title, number, mobileNumber, className: orderClass };
  };

  // With the welcome on top, its title is the page's H1 and the editor's an H2 (until it closes).
  const EditorHeading = welcome && welcomeOpen ? "h2" : "h1";
  return (
    <main id="contenido" ref={root} className="mx-auto max-w-[1240px] px-4 pb-36 sm:px-8">
      {welcome && welcomeOpen ? (
        <div className="pt-6 sm:pt-10">
          <WelcomeContext value={welcomeContext}>{welcome}</WelcomeContext>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4 pt-6 pb-8 sm:pt-10">
        <div>
          <p className="eyebrow">{demo ? "Editor · modo demo" : "Editor"}</p>
          <EditorHeading id="editor-title" tabIndex={-1} className="mt-2 font-display text-title leading-none tracking-tight outline-none">
            Tu tarjeta, <em className="text-signal">a tu manera.</em>
          </EditorHeading>
        </div>
        <span
          className={cn(
            "eyebrow inline-flex items-center gap-2 rounded-full px-3 py-1.5",
            savedPublished && savedName ? "bg-ok/10 text-ink-soft" : "bg-paper-deep text-muted",
          )}
        >
          <span className={cn("size-1.5 rounded-full", savedPublished && savedName ? "bg-ok" : "bg-muted")} />
          {savedPublished && savedName ? "Publicada" : "Sin publicar"}
        </span>
      </div>

      <QuickActions
        slug={savedSlug}
        fullName={savedName}
        shareUrl={publicUrl("share")}
        platform={platform}
        availability={wallet}
        demo={demo}
        blocked={!demo && blockedReason !== null}
        dirty={dirty}
      />
      <PendingNotices meetings={meetings.items} contacts={contacts.requests} contactsSeenAt={contacts.seenAt} />

      {demo ? (
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-dashed border-signal/50 bg-signal-wash/60 px-4 py-3 text-sm text-signal-deep">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>Modo demo:</strong> los cambios no se guardan.
          </p>
        </div>
      ) : null}

      <EditorIndex entries={indexEntries} />

      {/*
        Phones: one column where every section is placed with `order` (the inbox goes up when it has
        something). Desktop: the form on the left, the sticky preview and the rest on the right.
      */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8 xl:gap-12">
        <div className="contents lg:block lg:min-w-0 lg:space-y-6">
          {/* On phones the live preview sits on top; on desktop it lives in the sticky column. */}
          <div ref={mobilePreview} className="max-lg:order-1 lg:hidden">
            <PreviewPanel card={preview} />
          </div>
          <Section {...sectionProps("quien")} description="Lo básico que aparece en tu tarjeta y en el pase.">
            <div className="space-y-5">
              <AvatarField
                userId={initialCard.id}
                name={draft.fullName}
                url={draft.avatarUrl}
                demo={demo}
                onChange={(path, url) => editor.setAvatar(path, url)}
              />
              {serverErrors.avatarPath ? (
                <InlineError live>
                  {serverErrors.avatarPath}
                </InlineError>
              ) : null}
              {textField("fullName", "Nombre y apellidos", LIMITS.fullName, {
                autoComplete: "name",
                required: true,
                hint: passNameOverflows(draft.fullName) ? "En el pase se verá cortado: prueba con nombre y primer apellido." : undefined,
              })}
              <div className="grid gap-5 sm:grid-cols-2">
                {textField("headline", "Cargo", LIMITS.headline, { autoComplete: "organization-title" })}
                {textField("company", "Empresa", LIMITS.company, { autoComplete: "organization" })}
              </div>
              {textField("bio", "Sobre ti", LIMITS.bio, {
                multiline: true,
                placeholder: "Una o dos frases: a qué te dedicas y de qué te gusta hablar.",
              })}
              {/* Few people use these: tucked away unless they already have a value. */}
              {moreDetailsOpen || draft.location || draft.pronouns ? (
                <div ref={moreDetails} className="grid gap-5 sm:grid-cols-2">
                  {textField("location", "Ubicación", LIMITS.location, { placeholder: "Valencia, ES" })}
                  {textField("pronouns", "Pronombres", LIMITS.pronouns, { hint: "Se muestran como una etiqueta." })}
                </div>
              ) : (
                <button
                  type="button"
                  aria-expanded={false}
                  onClick={() => {
                    setMoreDetailsOpen(true);
                    requestAnimationFrame(() => moreDetails.current?.querySelector("input")?.focus());
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-field-border px-4 text-sm font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  <Plus className="size-4" aria-hidden />
                  Añadir más datos
                  <span className="font-normal text-muted">· ubicación, pronombres</span>
                </button>
              )}
            </div>
          </Section>

          <Section
            {...sectionProps("contactar")}
            description="Añade todos los datos que quieras y oculta los que no quieras enseñar. Lo que ocultes no lo verá nadie."
          >
            <LinksEditor
              links={draft.links}
              suggestedEmail={email}
              errors={errors}
              showErrors={submitted}
              onAdd={editor.addLink}
              onUpdate={editor.updateLink}
              onRemove={editor.removeLink}
              onRestore={editor.restoreLink}
              onMoveTo={editor.moveLinkTo}
              onDuplicate={editor.duplicateLink}
              takesMeetings={draft.acceptsMeetingRequests}
            />
          </Section>

          <Section
            {...sectionProps("estilo")}
            description="Tema, motivo y letra de tu pase y de tu tarjeta."
          >
            <DesignField
              value={{
                accentColor: draft.accentColor,
                detailColor: draft.detailColor,
                pattern: draft.pattern,
                patternSeed: draft.patternSeed,
                typeface: draft.typeface,
              }}
              card={preview}
              onChange={editor.setDesign}
            />
          </Section>

          <Section
            {...sectionProps("escanear")}
            description="Lo que puede hacer quien abre tu tarjeta, además de guardar tu contacto."
          >
            <SwitchRow
              checked={draft.acceptsMeetingRequests}
              onChange={editor.setAcceptsMeetingRequests}
              label="Recibir propuestas de reunión"
              description="Te proponen hora y la confirmas desde el email."
            />
            <SwitchRow
              checked={draft.acceptsContactRequests}
              onChange={editor.setAcceptsContactRequests}
              label="Recibir contactos"
              description="Un formulario para que te dejen sus datos."
              className="mt-5 border-t hairline pt-5"
            />
          </Section>

          <Section {...sectionProps("publicacion")}>
            <SwitchRow
              checked={draft.isPublished}
              onChange={editor.setPublished}
              label="Tarjeta publicada"
              description={
                draft.isPublished
                  ? "Tu tarjeta es visible para quien tenga el enlace o escanee tu QR."
                  : "Despublicada: quien abra tu enlace o escanee tu QR verá que no está disponible."
              }
              className="mb-6 border-b hairline pb-5"
            />
            <SlugField
              value={draft.slug}
              savedValue={savedSlug}
              siteHost={siteHost}
              demo={demo}
              serverError={serverErrors.slug}
              suggestion={isPlaceholderSlug(draft.slug) ? suggestSlug(draft.fullName) : null}
              onChange={(v) => editor.setField("slug", v)}
            />
          </Section>
        </div>

        {/*
          Desktop: the column scrolls on its own (it's taller than the screen), so the
          preview stays in reach and the lower panels don't wait for the page's end.
        */}
        <div className="contents lg:sticky lg:top-20 lg:-mx-3 lg:block lg:max-h-[calc(100dvh-5.5rem)] lg:min-w-0 lg:space-y-6 lg:overflow-y-auto lg:overscroll-contain lg:px-3 lg:pb-28 lg:[scrollbar-width:thin]">
          <div className="hidden lg:block">
            <PreviewPanel card={preview} />
          </div>
          <Section
            {...sectionProps("cartera")}
            description="Tu tarjeta como un pase más, junto a tus tarjetas y billetes: se abre sin conexión y sin buscarla, y se actualiza sola cuando cambias algo."
          >
            <WalletPanel
              slug={savedSlug}
              shareUrl={publicUrl("share")}
              qrUrl={publicUrl("qr")}
              availability={wallet}
              platform={platform}
              demo={demo}
              blockedReason={demo ? null : blockedReason}
              isPublished={savedPublished}
            />
          </Section>
          <Section {...sectionProps("reuniones")}>
            <MeetingsPanel items={meetings.items} available={meetings.available} enabled={savedAcceptsMeetings} demo={demo} />
          </Section>
          <Section {...sectionProps("contactos")}>
            <ContactsPanel
              requests={contacts.requests}
              available={contacts.available}
              enabled={savedAcceptsContacts}
              demo={demo}
            />
          </Section>
          <Section {...sectionProps("actividad")}>
            <StatsPanel stats={stats} links={draft.links} demo={demo} />
          </Section>
          <Section {...sectionProps("cuenta")}>
            <AccountPanel email={email} demo={demo} hasContacts={contacts.requests.length > 0} />
          </Section>
        </div>
      </div>

      <PreviewDock card={preview} anchor={mobilePreview} />
      <SaveBar
        dirty={dirty}
        saving={saving}
        status={status}
        errorCount={submitted ? errorCount : 0}
        onSave={save}
        onDiscard={discard}
        onUndoDiscard={undoDiscard}
        onNextError={() => focusInvalid(root.current, document.activeElement)}
      />
    </main>
  );
}
