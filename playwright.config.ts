import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/** Test-only login for the private dashboard (/admin), which shows sample data in demo mode. */
export const E2E_ADMIN = { username: "admin", password: "e2e-admin-password" };

/**
 * E2E runs against a production build in demo mode (no Supabase env needed):
 *   npm run build && npm run e2e
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    locale: "es-ES",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { ADMIN_USERNAME: E2E_ADMIN.username, ADMIN_PASSWORD: E2E_ADMIN.password },
    timeout: 60_000,
  },
});
