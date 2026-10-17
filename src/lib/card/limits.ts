/**
 * Card field limits, kept free of zod so client components can import them
 * without pulling the validation library into the browser bundle.
 */
export const MAX_LINKS = 20;

export const LIMITS = {
  fullName: 80,
  headline: 80,
  company: 80,
  location: 80,
  pronouns: 30,
  bio: 280,
  linkLabel: 40,
  linkValue: 300,
} as const;
