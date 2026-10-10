import Link from "next/link";
import type { ComponentPropsWithoutRef, ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The button rule (docs/BRAND.md § 8): `signal` is THE action that completes the
 * screen's task, one visible at a time; `ink` an important secondary one;
 * `outline` an alternative; `ghost` a tertiary one; `danger` only to confirm
 * something destructive.
 */
export type Variant = "ink" | "signal" | "outline" | "ghost" | "danger" | "paper";
export type Size = "sm" | "md" | "lg";

// `btn-<variant>` carries no style: it lets tests check the rule (one signal per screen).
const VARIANTS: Record<Variant, string> = {
  ink: "btn-ink bg-ink text-paper shadow-press-ink hover:-translate-y-px hover:bg-ink-soft",
  signal: "btn-signal bg-signal-strong text-white shadow-press-signal hover:-translate-y-px hover:bg-signal-deep",
  outline: "btn-outline border border-ink/80 text-ink hover:bg-ink hover:text-paper",
  ghost: "btn-ghost text-ink hover:bg-ink/[0.06]",
  danger: "btn-danger border border-danger text-danger hover:bg-danger hover:text-white",
  paper: "btn-paper bg-card text-ink shadow-soft hover:bg-white",
};

// Minimum heights, not fixed ones: a long label (or a large system font) wraps to two lines.
// `sm` is 44 px on phones and 40 px from the `sm` breakpoint up.
const SIZES: Record<Size, string> = {
  sm: "min-h-11 sm:min-h-10 px-3.5 py-1.5 text-sm gap-1.5 rounded-full",
  md: "min-h-11 px-5 py-2 text-body gap-2 rounded-full",
  lg: "min-h-14 px-7 py-3 text-body gap-2.5 rounded-full",
};

const BASE =
  "inline-flex select-none items-center justify-center text-center font-medium leading-tight whitespace-normal text-balance transition-[background-color,color,transform,box-shadow] duration-200 ease-[var(--ease-out-expo)] active:translate-y-px motion-reduce:hover:translate-y-0 disabled:pointer-events-none disabled:opacity-50";

export function buttonClasses({ variant = "ink", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

type ButtonProps = CommonProps & ComponentPropsWithRef<"button">;

export function Button({ variant, size, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses({ variant, size, className })} {...rest}>
      {children}
    </button>
  );
}

type LinkButtonProps = CommonProps & {
  href: string;
  /** Plain <a> for downloads, API routes and external URLs (no client routing/prefetch). */
  external?: boolean;
} & Omit<ComponentPropsWithoutRef<"a">, "href">;

export function LinkButton({ href, external, variant, size, className, children, ...rest }: LinkButtonProps) {
  const classes = buttonClasses({ variant, size, className });
  if (external) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}
