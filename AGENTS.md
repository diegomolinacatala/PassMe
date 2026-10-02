<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PassMe — project notes for agents

Digital business card delivered as Apple Wallet / Google Wallet passes. UI copy and docs are in **Spanish**; code and comments in English.

- **Commands**: `npm run dev` · `npm test` (Vitest, incl. the real SQL migrations on PGlite) · `npm run e2e:demo` (demo-mode build + Playwright, ignores `.env.local`; CI runs `npm run build && npm run e2e`) · `npm run lint` · `npm run typecheck` · `npm run doctor` (checks credentials and pending migrations).
- **Demo mode**: without Supabase env vars the app still runs (sample card at `/u/demo`, editor at `/dashboard` doesn't persist). Keep it working — E2E and CI depend on it.
- **Validation lives in `src/lib/card/*`** and is shared by client and server. When changing slug rules, link kinds or avatar paths, update the matching `CHECK` constraints in `supabase/migrations/` (and add a new migration file rather than editing an applied one once the project is live).
- **Security invariants**: hidden links must never reach the browser (public reads go through `get_public_card`); every Server Action re-checks the session (the public contact-form and meeting-proposal actions validate everything they receive, bound args included; meeting answers are authorized by their signed link, `verifyMeetingSignature`, never by anything the client sends); the admin (secret-key) client is only for pass generation and the wallet web service, analytics, rate limits, OTP lockout, contact-request inserts, meeting proposals and answers, the cleanup cron and account deletion; emails to a meeting guest's unverified address carry only PassMe's fixed text (see `src/lib/meetings/emails.ts`); hrefs are only built via `linkHref()`; rate limits use `createSharedRateLimiter` (Postgres), not the in-memory one.
- **New SQL functions**: Supabase grants EXECUTE on new `public` functions to `anon`/`authenticated` automatically — always `revoke ... from public, anon, authenticated` and grant only what's needed. Every new DB call needs a fallback for when its migration isn't applied yet (see `withDesignFallback`, `MISSING_FUNCTION` handling).
- **CSP**: `src/proxy.ts` issues a nonce per request and the root layout calls `connection()` so every page is dynamic. Don't add inline `<script>`s; external origins must be added to the CSP.
- **Design system** (brand guide: `docs/BRAND.md`): tokens in `src/app/globals.css` (`paper` beige, `ink` = Café, `signal` = Naranja, `glow` = Melocotón pastel; fonts `font-display`/`font-sans`/`font-mono`), `cn()` merges Tailwind classes. Warm editorial style: serif headlines with an italic signal-colored accent, mono uppercase "eyebrow" labels, numbered sections; the pass adds a fine-line generative motif around the photo (no decorative text: no serial numbers, no microtext).
- **Pass artwork**: `src/components/card/pass-art.tsx` is rendered by both the browser and Satori (`src/lib/pass/art.tsx`), so keep it to inline styles + flexbox, no hooks and no element ids. Design fields (`accentColor`, `detailColor`, `pattern`, `patternSeed`, `typeface`) are validated in `src/lib/card/design.ts`/`pattern.ts` and mirrored by DB `CHECK`s; retired motifs are mapped on read by `toPatternKind()`, never accepted from clients.
- **Docs**: setup steps in `docs/SETUP.md`, architecture/security model in `docs/ARCHITECTURE.md`.
