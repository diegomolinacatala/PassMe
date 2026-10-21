import { cn } from "@/lib/cn";

/** A segmented-control link: the CRM's navigation, periods and filters. No imports beyond `cn`: the nav is a client component. */
export function pillClasses(active: boolean): string {
  return cn(
    "inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
    active ? "bg-card text-ink shadow-soft" : "text-ink-soft hover:text-ink",
  );
}
