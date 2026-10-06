"use client";

import { Check } from "lucide-react";
import { useId, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { CHOICE_FOCUS, CHOICE_INPUT } from "@/components/ui/choice";
import { Field as FieldShell, InlineError, inputClasses } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { CARD_THEMES } from "@/lib/card/design";
import { CONTACT_ERROR_KEY, type QuickCardDraft, type QuickTextField } from "@/lib/card/quick";
import { LIMITS, type FieldErrors } from "@/lib/card/schema";
import { cn } from "@/lib/cn";

interface FieldDef {
  field: QuickTextField;
  label: string;
  placeholder?: string;
  autoComplete: string;
  type?: "text" | "email" | "tel" | "url";
  inputMode?: "text" | "email" | "tel" | "url";
  maxLength: number;
  required?: boolean;
}

const WHO: FieldDef[] = [
  { field: "fullName", label: "Nombre y apellidos", autoComplete: "name", maxLength: LIMITS.fullName, required: true },
  { field: "headline", label: "Cargo", autoComplete: "organization-title", maxLength: LIMITS.headline },
  { field: "company", label: "Empresa", autoComplete: "organization", maxLength: LIMITS.company },
];

const CONTACT: FieldDef[] = [
  { field: "phone", label: "Móvil", placeholder: "+34 600 000 000", autoComplete: "tel", type: "tel", inputMode: "tel", maxLength: LIMITS.linkValue },
  { field: "email", label: "Email", placeholder: "tu@email.com", autoComplete: "email", type: "email", inputMode: "email", maxLength: LIMITS.linkValue },
  { field: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/tu-perfil", autoComplete: "url", type: "url", inputMode: "url", maxLength: LIMITS.linkValue },
];

interface QuickCardFormProps {
  draft: QuickCardDraft;
  /** Errors to show right now (already filtered by touched/submitted). */
  errors: FieldErrors;
  onChange: (patch: Partial<QuickCardDraft>) => void;
  onBlurField: (field: QuickTextField) => void;
  /** Gets the form's own fields too (e.g. the CAPTCHA token rendered in `afterSubmit`). */
  onSubmit: (form: FormData) => void;
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  formError?: string | null;
  /** Under the button, inside the form (where the code will go, the CAPTCHA…). */
  afterSubmit?: ReactNode;
  footnote?: ReactNode;
}

/** "Crea la tuya": who you are, how to reach you, a color. Everything else waits for the editor. */
export function QuickCardForm({
  draft,
  errors,
  onChange,
  onBlurField,
  onSubmit,
  busy,
  submitLabel,
  busyLabel,
  formError,
  afterSubmit,
  footnote,
}: QuickCardFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const contactErrorId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget as HTMLFormElement));
    // After React paints the errors, take the person to the first one.
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  const last = CONTACT.at(-1)!.field;
  const renderField = (def: FieldDef, describedBy?: string) => (
    <Field
      key={def.field}
      def={def}
      value={draft[def.field]}
      error={errors[def.field]}
      describedBy={describedBy}
      onChange={onChange}
      onBlur={onBlurField}
      isLast={def.field === last}
    />
  );

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-8">
      <fieldset className="space-y-4">
        <legend className="eyebrow mb-4">Quién eres</legend>
        {renderField(WHO[0]!)}
        <div className="grid gap-4 sm:grid-cols-2">{WHO.slice(1).map((def) => renderField(def))}</div>
      </fieldset>

      <fieldset className="space-y-4" aria-describedby={errors[CONTACT_ERROR_KEY] ? contactErrorId : undefined}>
        <legend className="eyebrow mb-1">Cómo contactarte</legend>
        <p className="text-sm text-muted">
          Al menos uno. Lo verá y podrá guardarlo quien escanee tu QR o tenga tu enlace; puedes ocultarlo luego.
        </p>
        {CONTACT.map((def) => renderField(def, errors[CONTACT_ERROR_KEY] ? contactErrorId : undefined))}
        {errors[CONTACT_ERROR_KEY] ? (
          <InlineError id={contactErrorId} live>
            {errors[CONTACT_ERROR_KEY]}
          </InlineError>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="eyebrow mb-3">Color</legend>
        <ThemePicker value={draft.theme} onChange={(theme) => onChange({ theme })} />
      </fieldset>

      <div className="space-y-3">
        {formError ? <Notice tone="error">{formError}</Notice> : null}
        <SubmitButton pending={busy} pendingLabel={busyLabel}>
          {submitLabel}
        </SubmitButton>
        {afterSubmit}
        {footnote ? <div className="text-center text-xs leading-relaxed text-muted">{footnote}</div> : null}
      </div>
    </form>
  );
}

interface FieldProps {
  def: FieldDef;
  value: string;
  error?: string;
  describedBy?: string;
  onChange: (patch: Partial<QuickCardDraft>) => void;
  onBlur: (field: QuickTextField) => void;
  /** The last text field: Enter submits. Before it, Enter moves on to the next field. */
  isLast: boolean;
}

/** Enter on a phone's "Siguiente" key goes to the next field instead of submitting half a form. */
function focusNextField(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  event.preventDefault();
  const fields = Array.from(event.currentTarget.form?.querySelectorAll<HTMLInputElement>("input[name]") ?? []);
  fields[fields.indexOf(event.currentTarget) + 1]?.focus();
}

function Field({ def, value, error, describedBy, onChange, onBlur, isLast }: FieldProps) {
  // Only optional fields are marked; the contact ones are "at least one", said above them.
  const optional = !def.required && def.type === undefined;
  return (
    <FieldShell label={def.label} optional={optional} error={error} describedBy={describedBy}>
      {(props) => (
        <input
          {...props}
          name={def.field}
          value={value}
          onChange={(e) => onChange({ [def.field]: e.target.value })}
          onBlur={() => onBlur(def.field)}
          onKeyDown={isLast ? undefined : focusNextField}
          enterKeyHint={isLast ? "done" : "next"}
          type={def.type ?? "text"}
          inputMode={def.inputMode}
          autoComplete={def.autoComplete}
          autoCapitalize={def.type ? "none" : "words"}
          autoCorrect="off"
          spellCheck={false}
          maxLength={def.maxLength}
          placeholder={def.placeholder}
          required={def.required}
          className={inputClasses()}
        />
      )}
    </FieldShell>
  );
}

/** Native radios: one Tab stop, and the arrow keys go through the colors. */
function ThemePicker({ value, onChange }: { value: string; onChange: (theme: string) => void }) {
  const selected = CARD_THEMES.find((t) => t.id === value) ?? CARD_THEMES[0]!;
  return (
    <div>
      <div role="radiogroup" aria-label="Color de tu tarjeta" className="flex flex-wrap gap-2.5">
        {CARD_THEMES.map((theme) => {
          const active = theme.id === selected.id;
          return (
            <label
              key={theme.id}
              title={theme.name}
              className={cn(
                "relative grid size-11 place-items-center rounded-full shadow-hairline transition-transform duration-300 ease-[var(--ease-spring)] hover:-translate-y-0.5",
                active && "ring-2 ring-ink ring-offset-2 ring-offset-paper",
                CHOICE_FOCUS,
              )}
              style={{ backgroundColor: theme.background }}
            >
              <input
                type="radio"
                name="theme"
                value={theme.id}
                checked={active}
                onChange={() => onChange(theme.id)}
                aria-label={theme.name}
                className={CHOICE_INPUT}
              />
              <span className="grid size-4 place-items-center rounded-full" style={{ backgroundColor: theme.detail }}>
                {active ? <Check className="size-3" style={{ color: theme.background }} aria-hidden /> : null}
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-2.5 text-xs text-muted">
        {selected.name}. Motivo, letra y foto, luego en el editor.
      </p>
    </div>
  );
}
