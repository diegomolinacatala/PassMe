"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type Size, type Variant } from "./button";

interface SubmitButtonProps {
  children: ReactNode;
  /** What's happening while it waits, always as words: "Enviando…", "Cancelando…". */
  pendingLabel: string;
  /** Pending state from useActionState/useTransition; defaults to the parent form's status. */
  pending?: boolean;
  icon?: ReactNode;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  className?: string;
  type?: "submit" | "button";
  onClick?: () => void;
}

/** The one submit button: spinner + "<Verbo>ndo…" while it waits, disabled and busy meanwhile. */
export function SubmitButton({
  children,
  pendingLabel,
  pending,
  icon,
  variant = "signal",
  size = "lg",
  disabled,
  className = "w-full",
  type = "submit",
  onClick,
}: SubmitButtonProps) {
  const status = useFormStatus();
  const busy = pending ?? status.pending;
  return (
    <Button type={type} variant={variant} size={size} className={className} disabled={busy || disabled} aria-busy={busy} onClick={onClick}>
      {busy ? <LoaderCircle className="size-5 shrink-0 animate-spin" aria-hidden /> : icon}
      {busy ? pendingLabel : children}
    </Button>
  );
}
