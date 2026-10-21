import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "../playwright.config";

/*
 * The private CRM in demo mode: its own login (the test credentials are set on
 * the web server in playwright.config.ts) and sample data.
 */

const PAGES = ["/crm", "/crm/usuarios", "/crm/usuarios/00000000-0000-4000-8000-000000000001", "/crm/wallet", "/crm/contactos", "/crm/actividad"];

async function signIn(page: Page, password = E2E_ADMIN.password) {
  // The old address still leads to the login.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/crm\/entrar$/);
  await page.getByLabel("Usuario").fill(E2E_ADMIN.username);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Signed in only once the CRM shows up (the cookie arrives with that redirect).
  if (password === E2E_ADMIN.password) await expect(page).toHaveURL(/\/crm$/);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("private CRM", () => {
  // The login allows 5 tries per client: each test (and retry) comes from its own address.
  test.beforeEach(async ({ page }) => {
    const octet = () => Math.floor(Math.random() * 254) + 1;
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` });
  });

  test("rejects a wrong password and keeps every page behind the login", async ({ page }) => {
    await signIn(page, "no-es-la-clave-buena");
    await expect(page.getByText("Usuario o contraseña incorrectos.")).toBeVisible();
    await expect(page).toHaveURL(/\/crm\/entrar$/);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/crm\/entrar$/);
    }
    const csv = await page.request.get("/crm/usuarios.csv");
    expect(csv.status()).toBe(401);
  });

  test("shows the summary, filters by period and signs out", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/crm$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cómo va PassMe.");
    await expect(page.getByText("Modo demo")).toBeVisible();
    await expect(page.getByRole("heading", { name: "En la cartera ahora" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Embudo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Con qué móvil" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cómo llegan los nuevos" })).toBeVisible();

    await page.getByRole("link", { name: "7 días" }).click();
    await expect(page).toHaveURL(/\/crm\?d=7$/);
    await expect(page.getByRole("link", { name: "7 días" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/^Últimos 7 días · datos de las/)).toBeVisible();

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/crm\/entrar$/);
    await page.goto("/crm");
    await expect(page).toHaveURL(/\/crm\/entrar$/);
  });

  test("finds a user, opens their page and downloads the list", async ({ page }) => {
    await signIn(page);
    await page.getByRole("navigation", { name: "Secciones del CRM" }).getByRole("link", { name: "Usuarios" }).click();
    await expect(page).toHaveURL(/\/crm\/usuarios$/);
    await expect(page.getByRole("table", { name: /Usuarios de PassMe/ })).toBeVisible();

    await page.getByRole("searchbox").fill("lucia");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page).toHaveURL(/q=lucia/);
    const rows = page.getByRole("table", { name: /Usuarios de PassMe/ }).getByRole("row");
    await expect(rows).toHaveCount(2);

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Descargar CSV" }).click();
    expect((await download).suggestedFilename()).toMatch(/^passme-usuarios-\d{4}-\d{2}-\d{2}\.csv$/);

    await rows.nth(1).getByRole("link", { name: "Lucía Martín" }).click();
    await expect(page).toHaveURL(/\/crm\/usuarios\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lucía Martín");
    await expect(page.getByRole("heading", { name: "Su pase en el móvil" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
  });

  test("lists who has the pass, my own contacts and the activity", async ({ page }) => {
    await signIn(page);
    await page.goto("/crm/wallet");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quién la tiene en el móvil.");
    await expect(page.getByRole("table", { name: /con el pase en Apple Wallet/ })).toBeVisible();

    await page.goto("/crm/contactos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tu gente.");
    await expect(page.getByText("Lucía Martín · Hotel Mirador")).toBeVisible();
    await expect(page.getByText(/nunca quién/)).toBeVisible();

    await page.goto("/crm/actividad");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Qué está pasando.");
    await page.getByRole("link", { name: "Wallet", exact: true }).last().click();
    await expect(page).toHaveURL(/tipo=wallet/);
  });

  test("fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    await signIn(page);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(0);
    }
  });

  test("has no serious accessibility violations", async ({ page }) => {
    // Seven pages, each fully analyzed: more than the default 30 s when the whole suite runs at once.
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/crm/entrar");
    const check = async (path: string) => {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // After a redirect the title arrives a moment after the content.
      await expect(page).toHaveTitle(/CRM/);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
      expect(serious, `${path}\n${serious.join("\n")}`).toEqual([]);
    };
    await check("/crm/entrar");
    await signIn(page);
    for (const path of PAGES) {
      await page.goto(path);
      await check(path);
    }
  });
});
