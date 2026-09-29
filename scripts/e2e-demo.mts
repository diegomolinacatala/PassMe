/**
 * `npm run e2e:demo` — builds the app in demo mode and runs the Playwright
 * suite against it, whatever .env.local contains (a plain `npm run build`
 * would bake your real Supabase into the bundle and the demo tests would fail).
 * CI has no secrets, so it just runs `npm run build && npm run e2e`.
 * Run `npm run build` again afterwards if you want a production build.
 */
import { spawnSync } from "node:child_process";

const demoEnv: NodeJS.ProcessEnv = {
  ...process.env,
  // Empty values win over .env.local (Next.js never overrides variables that are already set).
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  SUPABASE_SECRET_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  TURNSTILE_SECRET_KEY: "",
};

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit", env: demoEnv, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx", ["next", "build"]);
run("npx", ["playwright", "test", ...process.argv.slice(2)]);
