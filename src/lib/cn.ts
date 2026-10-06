import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Our design tokens (src/app/globals.css), so `text-body` merges as a font size
// (not a text color) and `rounded-panel` / `shadow-press-ink` replace their peers.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["mark", "small", "body", "lead", "title", "display", "hero"],
      radius: ["control", "panel", "object", "pass"],
      shadow: ["object", "soft", "press", "press-ink", "press-signal", "focus-ring", "hairline", "inset"],
    },
  },
});

/** Joins class names and lets later Tailwind utilities override earlier ones (e.g. text-sm over text-base). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
