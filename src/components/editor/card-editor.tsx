"use client";

import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { saveCardAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { LIMITS, type FieldErrors } from "@/lib/card/schema";
import type { OwnerCard } from "@/lib/card/types";
import type { CardStats } from "@/lib/data/cards";
import { cn } from "@/lib/cn";
import { AccountPanel } from "./account-panel";
import { AvatarField } from "./avatar-field";
import { ColorField } from "./color-field";
import { Section, Switch, TextField } from "./fields";
import { LinksEditor } from "./links-editor";
import { PreviewPanel } from "./preview-panel";
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
  wallet: WalletAvailability;
  siteUrl: string;
  email: string | null;
  demo: boolean;
}

type SaveStatus = { kind: "idle" } | { kind: "saved"; at: number } | { kind: "error"; message: string } | { kind: "demo" };

export function CardEditor({ initialCard, stats, wallet, siteUrl, email, demo }: CardEditorProps) {
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
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  // Server errors belong to the exact draft that was submitted; any edit clears them.
  const [serverResult, setServerResult] = useState<{ draft: CardDraft; errors: FieldErrors } | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [saving, startSaving] = useTransition();

  const siteHost = siteUrl.replace(/^https?:\/\//, "");
  const preview = useMemo(() => draftToPublicCard(draft), [draft]);
  const errorCount = Object.keys(errors).length;
  const serverErrors: FieldErrors = serverResult && serverResult.draft === draft ? serverResult.errors : {};

  const fieldError = (field: string) =>
    serverErrors[field] ?? ((submitted || touched.has(field)) && errors[field] ? errors[field] : undefined);
  const touch = (field: string) => setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  const save = useCallback(() => {
    setSubmitted(true);
    if (errorCount > 0) {
      setStatus({ kind: "error", message: "Revisa los campos marcados en rojo." });
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
        setServerResult(null);
        setSubmitted(false);
        setStatus({ kind: "saved", at: Date.now() });
      } else {
        setServerResult({ draft, errors: result.errors });
        setStatus({ kind: "error", message: result.errors._form ?? "Revisa los campos marcados en rojo." });
      }
    });
  }, [demo, draft, editor, errorCount]);

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
      {...extra}
    />
  );

  const blockedReason = !savedName
    ? "Añade tu nombre y guarda para poder generar el pase."
    : dirty
      ? "Tienes cambios sin guardar: guarda para que el pase los incluya."
      : null;

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-36 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-6 pb-8 sm:pt-10">
        <div>
          <p className="eyebrow">{demo ? "Editor · modo demo" : "Editor"}</p>
          <h1 className="mt-2 font-display text-[length:var(--text-title)] leading-none tracking-tight">
            Tu tarjeta, <em className="text-signal">a tu manera.</em>
          </h1>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] uppercase",
            savedPublished && savedName ? "bg-ok/10 text-ok" : "bg-paper-deep text-muted",
          )}
        >
          <span className={cn("size-1.5 rounded-full", savedPublished && savedName ? "bg-ok" : "bg-muted")} />
          {savedPublished && savedName ? "Publicada" : "Sin publicar"}
        </span>
      </div>

      {demo ? (
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-dashed border-signal/50 bg-signal-wash/60 px-4 py-3 text-sm text-signal-deep">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>Modo demo.</strong> Supabase aún no está conectado: puedes jugar con el editor pero nada se guarda. Sigue{" "}
            <code className="font-mono">docs/SETUP.md</code> para activarlo.
          </p>
        </div>
      ) : null}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:gap-12">
        <div className="space-y-6">
          <Section number="01" title="Quién eres" description="Lo básico que aparece en el pase y en tu página.">
            <div className="space-y-5">
              <AvatarField
                userId={initialCard.id}
                name={draft.fullName}
                url={draft.avatarUrl}
                demo={demo}
                onChange={(path, url) => editor.setAvatar(path, url)}
              />
              {serverErrors.avatarPath ? (
                <p className="text-sm text-danger" role="alert">
                  {serverErrors.avatarPath}
                </p>
              ) : null}
              {textField("fullName", "Nombre y apellidos", LIMITS.fullName, {
                placeholder: "Alex Rivera",
                autoComplete: "name",
                required: true,
              })}
              <div className="grid gap-5 sm:grid-cols-2">
                {textField("headline", "Cargo", LIMITS.headline, { placeholder: "Product Designer", autoComplete: "organization-title" })}
                {textField("company", "Empresa", LIMITS.company, { placeholder: "Estudio Norte", autoComplete: "organization" })}
                {textField("location", "Ubicación", LIMITS.location, { placeholder: "Valencia, ES" })}
                {textField("pronouns", "Pronombres", LIMITS.pronouns, { placeholder: "Opcional", hint: "Se muestran como una etiqueta." })}
              </div>
              {textField("bio", "Sobre ti", LIMITS.bio, {
                multiline: true,
                placeholder: "Una o dos frases: a qué te dedicas y de qué te gusta hablar.",
              })}
            </div>
          </Section>

          <Section
            number="02"
            title="Tus contactos"
            description="Añade todos los que quieras y oculta los que no quieras enseñar. Lo oculto nunca sale del servidor."
          >
            <LinksEditor
              links={draft.links}
              errors={errors}
              showErrors={submitted}
              onAdd={editor.addLink}
              onUpdate={editor.updateLink}
              onRemove={editor.removeLink}
              onMove={editor.moveLink}
            />
          </Section>

          <Section number="03" title="Estilo" description="El color de fondo del pase y de tu página. El texto se ajusta solo para que se lea.">
            <ColorField value={draft.accentColor} onChange={editor.setAccent} />
          </Section>

          <Section
            number="04"
            title="Publicación"
            aside={<Switch checked={draft.isPublished} onChange={editor.setPublished} label="Tarjeta publicada" />}
            description={
              draft.isPublished
                ? "Tu tarjeta es visible para quien tenga el enlace o escanee tu QR."
                : "Despublicada: el enlace y el QR mostrarán «no encontrada»."
            }
          >
            <SlugField
              value={draft.slug}
              savedValue={savedSlug}
              siteHost={siteHost}
              demo={demo}
              serverError={serverErrors.slug}
              onChange={(v) => editor.setField("slug", v)}
            />
          </Section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          <PreviewPanel card={preview} />
          <Section number="05" title="A la cartera">
            <WalletPanel
              slug={savedSlug}
              profileUrl={`${siteUrl}/u/${savedSlug}`}
              availability={wallet}
              demo={demo}
              blockedReason={demo ? null : blockedReason}
              isPublished={savedPublished}
            />
          </Section>
          <Section number="06" title="Actividad">
            <StatsPanel stats={stats} links={draft.links} demo={demo} />
          </Section>
          <Section number="07" title="Cuenta">
            <AccountPanel email={email} demo={demo} />
          </Section>
        </aside>
      </div>

      <SaveBar dirty={dirty} saving={saving} status={status} errorCount={submitted ? errorCount : 0} onSave={save} />
    </div>
  );
}

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  status: SaveStatus;
  errorCount: number;
  onSave: () => void;
}

function SaveBar({ dirty, saving, status, errorCount, onSave }: SaveBarProps) {
  const message = saving
    ? "Guardando…"
    : status.kind === "error" && (dirty || errorCount > 0)
      ? status.message
      : dirty
        ? "Cambios sin guardar"
        : status.kind === "saved"
          ? "Guardado. Los pases se actualizarán en unos segundos."
          : status.kind === "demo"
            ? "Modo demo: los cambios no se guardan."
            : "Todo guardado";

  const tone = status.kind === "error" && (dirty || errorCount > 0) ? "error" : dirty ? "dirty" : "ok";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-6 sm:pb-5">
      <div
        className={cn(
          "pointer-events-auto mx-auto flex max-w-[640px] items-center gap-3 rounded-full border py-2 pr-2 pl-5 shadow-object backdrop-blur-md transition-colors duration-300",
          tone === "dirty" ? "border-ink bg-ink text-paper" : "border-line bg-card/90 text-ink",
        )}
        role="status"
        aria-live="polite"
      >
        {tone === "error" ? <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden /> : null}
        {tone === "ok" ? <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden /> : null}
        {tone === "dirty" ? <span className="size-2 shrink-0 animate-pulse rounded-full bg-signal" aria-hidden /> : null}
        <p className="min-w-0 flex-1 truncate text-sm">{message}</p>
        <span className="hidden font-mono text-[10px] tracking-widest opacity-50 sm:inline">⌘S</span>
        <Button variant={tone === "dirty" ? "signal" : "ink"} size="sm" onClick={onSave} disabled={saving || (!dirty && tone !== "error")}>
          {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Guardar
        </Button>
      </div>
    </div>
  );
}
