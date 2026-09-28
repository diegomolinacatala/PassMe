import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

interface MarkProps {
  className?: string;
  style?: CSSProperties;
  /** Color of the avatar cut-out; defaults to the page's paper color. */
  cutout?: string;
  /** Color of the card being passed behind; defaults to a faded currentColor. */
  echo?: string;
  title?: string;
}

/** The PassMe mark (see lib/brand.ts for the server-rendered twin). */
export function Mark({ className, style, cutout = "var(--color-paper)", echo, title }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      style={style}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <rect
        x="13"
        y="7"
        width="34"
        height="44"
        rx="8"
        transform="rotate(-11 30 29)"
        fill="none"
        stroke={echo ?? "currentColor"}
        strokeWidth="4"
        strokeOpacity={echo ? 1 : 0.5}
      />
      <rect x="18" y="13" width="34" height="44" rx="8" fill="currentColor" />
      <circle cx="35" cy="29" r="7" fill={cutout} />
      <rect x="26" y="42" width="18" height="5" rx="2.5" fill={cutout} />
    </svg>
  );
}

interface LogoProps {
  href?: string;
  className?: string;
}

export function Logo({ href = "/", className }: LogoProps) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center gap-2 text-ink", className)}
      aria-label="PassMe, inicio"
    >
      <Mark
        className="size-8 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-rotate-6"
        echo="var(--color-signal)"
      />
      <span className="font-display text-[1.65rem] leading-none tracking-tight">
        Pass<span className="italic text-signal">Me</span>
      </span>
    </Link>
  );
}
