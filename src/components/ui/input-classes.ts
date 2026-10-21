import { cn } from "@/lib/cn";

/** Plain module (no "use client"): server components can style their own inputs with it too. */

export type InputSize = "md" | "sm" | "multiline";

/**
 * The one look for text inputs: 16 px text (iOS doesn't zoom in), a border at
 * ≥ 3:1 (`field-border`) and a visible signal outline on focus.
 * `md` is 48 px high; `sm` (44 px) is for compact rows such as the contact details editor.
 */
export function inputClasses({ size = "md", className }: { size?: InputSize; className?: string } = {}): string {
  return cn(
    "w-full rounded-control border border-field-border bg-card px-3.5 text-base text-ink placeholder:text-muted/70",
    "transition-[border-color] duration-200 hover:border-ink focus:border-ink",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
    "read-only:opacity-60 aria-[invalid=true]:border-danger",
    size === "md" && "h-12",
    size === "sm" && "h-11",
    size === "multiline" && "min-h-24 resize-y py-2.5 leading-relaxed",
    className,
  );
}
