"use client";

import { CircleAlert, CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { saveCardAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/field";
import { describeErrors } from "@/lib/card/save-errors";
import { LIMITS, type FieldErrors } from "@/lib/card/schema";
import type { OwnerCard } from "@/lib/card/types";
import type { ContactRequest } from "@/lib/card/contact";
import { isPlaceholderSlug, suggestSlug } from "@/lib/card/slug";
import type { CardStats } from "@/lib/data/cards";
import { cn } from "@/lib/cn";
import type { Platform } from "@/lib/platform";
import { AccountPanel } from "./account-panel";
import { AvatarField } from "./avatar-field";
import { ContactsPanel } from "./contacts-panel";
import { DesignField } from "./design-field";
import { Section, SwitchRow, TextField } from "./fields";
import { LinksEditor } from "./links-editor";
import { MeetingsPanel, type MeetingItem } from "./meetings-panel";
import { PendingNotices } from "./pending-notices";
import { PreviewPanel } from "./preview-panel";
import { WelcomeContext } from "./welcome-panel";
import { QuickActions } from "./quick-actions";
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

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saved"; at: number }
  // Saved, but the database couldn't store the new design yet (a migration is pending).
  | { kind: "partial" }
  | { kind: "error"; message: string }
  | { kind: "demo" };

/** How long "Guardado" stays on screen before the bar slides away. */
const SAVED_NOTICE_MS = 3000;

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
    if (status.kind !== "saved" && status.kind !== "demo") return;
    const timer = window.setTimeout(() => setStatus({ kind: "idle" }), SAVED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

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

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:gap-12">
        <div className="min-w-0 space-y-6">
          {/* On phones the live preview sits on top; on desktop it lives in the sticky aside. */}
          <div className="lg:hidden">
            <PreviewPanel card={preview} />
          </div>
          <Section number="01" title="Quién eres" description="Lo básico que aparece en tu tarjeta y en el pase.">
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
              })}
              <div className="grid gap-5 sm:grid-cols-2">
                {textField("headline", "Cargo", LIMITS.headline, { autoComplete: "organization-title" })}
                {textField("company", "Empresa", LIMITS.company, { autoComplete: "organization" })}
                {textField("location", "Ubicación", LIMITS.location, { placeholder: "Valencia, ES" })}
                {textField("pronouns", "Pronombres", LIMITS.pronouns, { hint: "Se muestran como una etiqueta." })}
              </div>
              {textField("bio", "Sobre ti", LIMITS.bio, {
                multiline: true,
                placeholder: "Una o dos frases: a qué te dedicas y de qué te gusta hablar.",
              })}
            </div>
          </Section>

          <Section
            number="02"
            title="Cómo contactarte"
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
              onMove={editor.moveLink}
            />
          </Section>

          <Section
            number="03"
            title="Estilo"
            description="Motivo, colores y letra de tu pase y de tu tarjeta. El texto se ajusta solo para que se lea."
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

          <Section number="04" title="Publicación">
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
            <SwitchRow
              checked={draft.acceptsMeetingRequests}
              onChange={editor.setAcceptsMeetingRequests}
              label="Recibir propuestas de reunión"
              description="Tu tarjeta muestra «Agendar reunión»: quien te escanee propone día y hora, y a ti te llega un email para confirmarla con un toque. Os enviamos la invitación a los dos."
              className="mt-6 border-t hairline pt-5"
            />
            <SwitchRow
              checked={draft.acceptsContactRequests}
              onChange={editor.setAcceptsContactRequests}
              label="Recibir contactos"
              description="Tu tarjeta muestra «Déjale tu contacto» para que quien te escanee te deje su nombre, email o teléfono. Lo verás en «Contactos recibidos»."
              className="mt-5 border-t hairline pt-5"
            />
          </Section>
        </div>

        {/*
          Desktop: the column scrolls on its own (it's taller than the screen), so the
          preview stays in reach and the lower panels don't wait for the page's end.
        */}
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-6 lg:-mx-3 lg:max-h-[calc(100dvh-1.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:px-3 lg:pb-28 lg:[scrollbar-width:thin]">
          <div className="hidden lg:block">
            <PreviewPanel card={preview} />
          </div>
          <Section
            number="05"
            title="A la cartera"
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
          <Section number="06" title="Reuniones">
            <MeetingsPanel items={meetings.items} available={meetings.available} enabled={savedAcceptsMeetings} demo={demo} />
          </Section>
          <Section number="07" title="Contactos recibidos">
            <ContactsPanel
              requests={contacts.requests}
              available={contacts.available}
              enabled={savedAcceptsContacts}
              demo={demo}
            />
          </Section>
          <Section number="08" title="Actividad">
            <StatsPanel stats={stats} links={draft.links} demo={demo} />
          </Section>
          <Section number="09" title="Cuenta">
            <AccountPanel email={email} demo={demo} hasContacts={contacts.requests.length > 0} />
          </Section>
        </aside>
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        status={status}
        errorCount={submitted ? errorCount : 0}
        onSave={save}
        onNextError={() => focusInvalid(root.current, document.activeElement)}
      />
    </main>
  );
}

const subscribeNoop = () => () => {};

/** "⌘S" on Apple devices, "Ctrl S" elsewhere (null while rendering on the server). */
function useSaveShortcut(): string | null {
  return useSyncExternalStore(
    subscribeNoop,
    () => (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘S" : "Ctrl S"),
    () => null,
  );
}

/** Keeps a focused field from ending up under the fixed bar (WCAG 2.4.11). */
function useScrollPadding(bar: HTMLElement | null, visible: boolean) {
  useEffect(() => {
    if (!visible || !bar) return;
    const html = document.documentElement;
    const apply = () => {
      html.style.scrollPaddingBottom = `${bar.offsetHeight + 16}px`;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      html.style.scrollPaddingBottom = "";
    };
  }, [bar, visible]);
}

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  status: SaveStatus;
  errorCount: number;
  onSave: () => void;
  onNextError: () => void;
}

/**
 * Slides up with the first change and stays while there's something to say:
 * unsaved changes, saving, an error, or "Guardado" for a moment. Otherwise it
 * isn't there, so it never covers the welcome, the QR or a field.
 */
function SaveBar({ dirty, saving, status, errorCount, onSave, onNextError }: SaveBarProps) {
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const shortcut = useSaveShortcut();
  const visible = dirty || saving || (status.kind === "error" ? errorCount > 0 : status.kind !== "idle");
  useScrollPadding(bar, visible);

  const message = saving
    ? "Guardando…"
    : status.kind === "error" && (dirty || errorCount > 0)
      ? status.message
      : dirty
        ? "Cambios sin guardar"
        : status.kind === "partial"
          ? "Guardado, salvo algunas opciones nuevas: falta actualizar la base de datos."
          : status.kind === "saved"
            ? "Guardado. Los pases se actualizarán en unos segundos."
            : status.kind === "demo"
              ? "Modo demo: los cambios no se guardan."
              : "Todo guardado";

  const tone =
    status.kind === "error" && (dirty || errorCount > 0) ? "error" : dirty ? "dirty" : status.kind === "partial" ? "warn" : "ok";

  return (
    <div
      ref={setBar}
      // Out of the tab order and hidden from screen readers while it's off screen.
      inert={!visible}
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-200 ease-[var(--ease-out-expo)] sm:px-6 sm:pb-5",
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0",
      )}
    >
      {/* On desktop the bar sits under the form column, clear of the preview. */}
      <div className="mx-auto max-w-[1240px] lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8 lg:px-2 xl:gap-12">
        <div
          className={cn(
            "flex items-center gap-3 rounded-object border py-2 pr-2 pl-5 shadow-object backdrop-blur-md transition-colors duration-300 max-lg:mx-auto max-lg:max-w-[640px]",
            visible && "pointer-events-auto",
            tone === "dirty" ? "border-ink bg-ink text-paper" : "hairline bg-card/90 text-ink",
          )}
        >
          {tone === "error" ? <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden /> : null}
          {tone === "warn" ? <TriangleAlert className="size-4 shrink-0 text-signal-deep" aria-hidden /> : null}
          {tone === "ok" ? <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden /> : null}
          {tone === "dirty" ? <span className="size-2 shrink-0 animate-pulse rounded-full bg-signal" aria-hidden /> : null}
          <p className="line-clamp-2 min-w-0 flex-1 text-sm" role="status" aria-live="polite">
            {message}
          </p>
          {tone === "error" && errorCount > 1 ? (
            <Button variant="ghost" size="sm" onClick={onNextError} className="shrink-0">
              Ver
            </Button>
          ) : null}
          {shortcut ? (
            <span className="hidden font-mono text-mark tracking-widest opacity-60 sm:inline" aria-hidden>
              {shortcut}
            </span>
          ) : null}
          <Button
            variant={tone === "dirty" ? "signal" : "ink"}
            size="sm"
            onClick={onSave}
            disabled={saving || (!dirty && tone !== "error")}
            className="shrink-0"
          >
            {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
