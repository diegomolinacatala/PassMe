import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "ink" | "signal" | "outline" | "ghost" | "danger" | "paper";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  ink: "bg-ink text-paper shadow-[0_1px_0_rgb(255_255_255/0.12)_inset,0_6px_16px_-8px_rgb(34_27_23/0.6)] hover:bg-ink-soft",
  signal:
    "bg-signal-strong text-white shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_8px_20px_-10px_rgb(194_78_28/0.7)] hover:bg-signal-deep",
  outline: "border border-ink/80 text-ink hover:bg-ink hover:text-paper",
  ghost: "text-ink hover:bg-ink/[0.06]",
  danger: "border border-danger/40 text-danger hover:bg-danger hover:text-white",
  paper: "bg-card text-ink shadow-soft hover:bg-white",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-full",
  md: "h-11 px-5 text-[0.95rem] gap-2 rounded-full",
  lg: "h-14 px-7 text-base gap-2.5 rounded-full",
};

const BASE =
  "inline-flex select-none items-center justify-center font-medium whitespace-nowrap transition-[background-color,color,transform,box-shadow] duration-200 ease-[var(--ease-out-expo)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

export function buttonClasses({ variant = "ink", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

type ButtonProps = CommonProps & ComponentPropsWithoutRef<"button">;

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
