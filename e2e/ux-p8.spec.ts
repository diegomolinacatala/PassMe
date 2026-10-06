import { expect, test } from "@playwright/test";

/** UX audit P8: landing, legal pages, unpublish and meeting settings. */

test.describe("P8.6 landing", () => {
  test("the hero names no single-platform gesture", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby='hero-title']");
    await expect(hero).toContainText("sea iPhone o Android");
    await expect(page.locator("main")).not.toContainText(/doble clic|botón lateral/i);
  });

  test("five quick questions, closed until opened", async ({ page }) => {
    await page.goto("/");
    const faq = page.locator("#preguntas");
    await expect(faq.getByRole("heading", { name: /Preguntas rápidas/ })).toBeVisible();
    const items = faq.locator("details");
    await expect(items).toHaveCount(5);
    for (const question of [
      "¿La otra persona necesita una app?",
      "¿En qué se diferencia de NameDrop o de un Linktree?",
      "¿Cuánto cuesta?",
      "¿Qué datos guardáis?",
      "¿Y si me arrepiento?",
    ]) {
      await expect(faq.getByText(question)).toBeVisible();
    }
    await expect(faq.getByText(/gratis para siempre/)).toBeHidden();
    await faq.getByText("¿Cuánto cuesta?").click();
    await expect(faq.getByText(/gratis para siempre/)).toBeVisible();
  });

  test("the scan hint shows on a desktop only", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByText("Pruébalo: escanéalo con tu móvil →")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Pruébalo: escanéalo con tu móvil →")).toBeHidden();
  });
});

test.describe("P8.7 legal pages", () => {
  test("privacy: 30-second summary, date and an index that jumps to every section", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/privacidad");
    await expect(page.getByText("Última actualización: octubre de 2026")).toBeVisible();
    await expect(page.getByRole("heading", { name: "En 30 segundos" })).toBeVisible();
    const index = page.getByRole("navigation", { name: "En esta página" });
    const links = index.getByRole("link");
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(9);
    const sections = page.locator("main section[id]:not([aria-labelledby='legal-summary'])");
    await expect(sections).toHaveCount(count);
    for (let i = 0; i < count; i += 1) {
      const href = await links.nth(i).getAttribute("href");
      expect(href).toMatch(/^#[a-z0-9-]+$/);
      await expect(page.locator(`section${href}`)).toHaveCount(1);
    }
    await index.getByRole("link", { name: /Cookies/ }).click();
    await expect(page).toHaveURL(/#cookies$/);
    await expect(page.getByRole("heading", { name: "Cookies", level: 2 })).toBeInViewport();
    // Old anchors keep working (emails and the meeting form link to them).
    await expect(page.locator("section#reuniones")).toHaveCount(1);
    await expect(page.locator("section#contactos")).toHaveCount(1);
  });

  test("terms and legal notice have an index too", async ({ page }) => {
    for (const path of ["/terminos", "/aviso-legal"]) {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "En esta página" }).getByRole("link").first()).toBeVisible();
    }
  });
});

test.describe("P8.5 unpublish", () => {
  test("asks first, Escape keeps it published, and confirming turns it off", async ({ page }) => {
    await page.goto("/dashboard");
    const toggle = page.getByRole("switch", { name: "Tarjeta publicada", exact: true });
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await toggle.click();
    const dialog = page.getByRole("alertdialog", { name: "¿Despublicar tu tarjeta?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("también los impresos");
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(toggle).toBeFocused();

    await toggle.click();
    await dialog.getByRole("button", { name: "Despublicar" }).click();
    await expect(dialog).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText(/tu pase queda en pausa/)).toBeVisible();

    // Turning it back on doesn't ask.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(dialog).toBeHidden();
  });
});

test.describe("P8.4 meeting settings", () => {
  test("folded under the switch, never empty, and gone when meetings are off", async ({ page }) => {
    await page.goto("/dashboard");
    const settings = page.locator("details", { hasText: "Ajustes de reuniones" });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("button", { name: "Llamada", exact: true })).toBeHidden();
    await settings.getByText("Ajustes de reuniones").click();

    const phone = settings.getByRole("button", { name: "Llamada", exact: true });
    await expect(phone).toHaveAttribute("aria-pressed", "true");
    await phone.click();
    await expect(phone).toHaveAttribute("aria-pressed", "false");
    await settings.getByRole("button", { name: "En persona" }).click();
    // The last format left can't be switched off.
    await expect(settings.getByRole("button", { name: "Videollamada" })).toBeDisabled();

    // Only later hours than the first one can close the range.
    await settings.getByLabel("Desde las").selectOption("14:00");
    await expect(settings.getByLabel("Hasta las").locator("option").first()).toHaveText("14:30");

    await page.getByRole("switch", { name: "Recibir propuestas de reunión", exact: true }).click();
    await expect(settings).toBeHidden();
  });
});
