"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { LinkIcon } from "@/components/card/link-icon";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { detectLink } from "@/lib/card/link-detect";
import { EDITABLE_LINK_KINDS, getLinkKind, type LinkKind } from "@/lib/card/links";
import { cn } from "@/lib/cn";

interface AddLinkFieldProps {
  full: boolean;
  /** Adds a detail; `focus` puts the caret in its row (an empty one needs filling in). */
  onAdd: (kind: LinkKind, value: string, focus: boolean) => void;
}

/**
 * «Pega un enlace, email o teléfono»: one field that recognises what was
 * pasted, and «Elegir tipo…» with the full list for everything else.
 */
export function AddLinkField({ full, onAdd }: AddLinkFieldProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [chooserOpen, setChooserOpen] = useState(false);
  const detected = detectLink(text);
  const unknown = text.trim() !== "" && !detected;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (full) return;
    if (!detected) {
      // Nothing typed: just open the list; something unknown: ask what it is.
      setChooserOpen(true);
      return;
    }
    onAdd(detected.kind, detected.value, false);
    setText("");
  }

  function choose(kind: LinkKind) {
    const value = text.trim();
    onAdd(kind, value, true);
    setText("");
    setChooserOpen(false);
  }

  return (
    <div>
      <form onSubmit={submit} noValidate>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-soft">
          Pega un enlace, email o teléfono
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={full}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-describedby={`${id}-hint`}
            placeholder="linkedin.com/in/tu-perfil"
            className={inputClasses({ className: "min-w-0 flex-1" })}
          />
          <Button type="submit" variant="ink" disabled={full} className="h-12 shrink-0">
            <Plus className="size-4" aria-hidden />
            Añadir
          </Button>
        </div>
        <p id={`${id}-hint`} aria-live="polite" className="mt-1.5 flex min-h-5 items-center gap-1.5 text-xs text-muted">
          {full ? (
            "Has llegado al máximo. Quita alguno para añadir otro."
          ) : detected ? (
            <>
              <LinkIcon kind={detected.kind} size={13} />
              Se añadirá como {getLinkKind(detected.kind).label}.
            </>
          ) : unknown ? (
            "No sé qué es: elige el tipo en la lista."
          ) : (
            "Reconoce LinkedIn, Instagram, WhatsApp, webs, emails y teléfonos."
          )}
        </p>
      </form>

      <button
        type="button"
        aria-expanded={chooserOpen}
        aria-controls={`${id}-kinds`}
        disabled={full}
        onClick={() => setChooserOpen((open) => !open)}
        className="-ml-2 mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
      >
        <ChevronDown className={cn("size-4 transition-transform duration-200", chooserOpen && "rotate-180")} aria-hidden />
        Elegir tipo…
      </button>
      <div id={`${id}-kinds`} hidden={!chooserOpen} className="mt-2">
        <ul className="flex flex-wrap gap-2" aria-label="Tipos de dato">
          {EDITABLE_LINK_KINDS.map((kind) => (
            <li key={kind}>
              <button
                type="button"
                disabled={full}
                onClick={() => choose(kind)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-field-border bg-card py-1 pr-3.5 pl-2.5 text-sm transition-colors hover:border-ink disabled:opacity-40"
              >
                <LinkIcon kind={kind} size={15} />
                {getLinkKind(kind).label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
