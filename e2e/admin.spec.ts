import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "../playwright.config";

/*
 * The private dashboard in demo mode: its own login (the test credentials are
 * set on the web server in playwright.config.ts) and sample numbers.
 */

async function signIn(page: Page, password = E2E_ADMIN.password) {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar$/);
  await page.getByLabel("Usuario").fill(E2E_ADMIN.username);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.describe("private dashboard", () => {
  // The login allows 5 tries per client: each test (and retry) comes from its own address.
  test.beforeEach(async ({ page }) => {
    const octet = () => Math.floor(Math.random() * 254) + 1;
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` });
  });

  test("rejects a wrong password", async ({ page }) => {
    await signIn(page, "no-es-la-clave-buena");
    await expect(page.getByText("Usuario o contraseña incorrectos.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/entrar$/);
  });

  test("shows the numbers, filters by period and signs out", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cómo va PassMe.");
    await expect(page.getByText("Modo demo")).toBeVisible();
    await expect(page.getByRole("heading", { name: "En la cartera ahora" })).toBeVisible();
    await expect(page.getByRole("table", { name: /Usuarios de PassMe/ })).toBeVisible();

    await page.getByRole("link", { name: "7 días" }).click();
    await expect(page).toHaveURL(/\/admin\?d=7$/);
    await expect(page.getByRole("link", { name: "7 días" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/^Últimos 7 días · datos de las/)).toBeVisible();

    // Nothing wider than the screen, whatever the table's width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/admin\/entrar$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/entrar$/);
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of ["/admin/entrar", "/admin"]) {
      if (path === "/admin") await signIn(page);
      else await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // After the login redirect the title arrives a moment after the content.
      await expect(page).toHaveTitle(/Panel privado/);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
      expect(serious, `${path}\n${serious.join("\n")}`).toEqual([]);
    }
  });
});
