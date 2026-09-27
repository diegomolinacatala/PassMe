import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets later Tailwind utilities override earlier ones (e.g. text-sm over text-base). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
