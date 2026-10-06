import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

export type NoticeTone = "ok" | "error" | "info";

const ICONS = { ok: CircleCheck, error: CircleAlert, info: Info } as const;

const TONES: Record<NoticeTone, { box: string; icon: string }> = {
  ok: { box: "bg-ok/10 text-ink-soft", icon: "text-ok" },
  error: { box: "bg-danger-wash text-danger", icon: "text-danger" },
  info: { box: "bg-signal-wash text-signal-deep", icon: "text-signal-deep" },
};

interface NoticeProps {
  tone: NoticeTone;
  /** What happened, in a word or a short sentence (bold). */
  title?: ReactNode;
  /** What to do next, or the details. */
  children?: ReactNode;
  /** On Café surfaces: paper text and icon (never `glow` for a message). */
  onDark?: boolean;
  /** Something to do about it, on the right (e.g. "Cambiar email"). */
  action?: ReactNode;
  id?: string;
  /** Focusable when it replaces what had the focus (e.g. after an answer). */
  focusable?: boolean;
  ref?: Ref<HTMLDivElement>;
  className?: string;
}

/**
 * A message box: icon + "what happened + what to do". Errors are alerts; the
 * rest are polite status messages. `ok` and `error` use their state colors only
 * alongside the icon and the words, never as the only signal.
 */
export function Notice({ tone, title, children, onDark, action, id, focusable, ref, className }: NoticeProps) {
  const Icon = ICONS[tone];
  const colors = TONES[tone];
  return (
    <div
      ref={ref}
      id={id}
      tabIndex={focusable ? -1 : undefined}
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-2xl px-4 py-3 text-sm outline-none",
        onDark ? "bg-paper/10 text-paper" : colors.box,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", onDark ? "text-paper" : colors.icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className={cn("font-medium", !onDark && tone === "ok" && "text-ink")}>{title}</p> : null}
        {children ? <div className={cn(title ? "mt-0.5" : null)}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
