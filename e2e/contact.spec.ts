import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** "Déjale tu contacto" on the demo card (demo mode: validated, nothing stored). */
test.describe("contact exchange", () => {
  test("validates and 'sends' the visitor's details", async ({ page }) => {
    await page.goto("/u/demo?src=qr");
    await page.getByRole("button", { name: /Déjale tu contacto a Alex/ }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const axe = await new AxeBuilder({ page }).include("form").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

    await page.getByRole("button", { name: "Dejarle mi contacto" }).click();
    await expect(page.getByText("Dinos cómo te llamas.")).toBeVisible();
    await expect(page.getByText("Deja tu móvil o tu email: con uno basta.")).toBeVisible();
    await expect(page.getByText("Marca la casilla para poder enviar tus datos.")).toBeVisible();

    // Values survive the failed attempt.
    await page.getByLabel("Nombre").fill("Lucía Martín");
    await page.getByLabel("Email").fill("lucia@example");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Dejarle mi contacto" }).click();
    await expect(page.getByText("Email no válido.")).toBeVisible();
    // The first field to fix gets the focus; everything else stays as it was (the checkbox too).
    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(page.getByLabel("Nombre")).toHaveValue("Lucía Martín");
    await expect(page.getByRole("checkbox")).toBeChecked();

    await page.getByLabel("Email").fill("lucia@example.com");
    await page.getByRole("button", { name: "Dejarle mi contacto" }).click();
    await expect(page.getByRole("status")).toContainText("Alex ya tiene tu contacto.");
    await expect(page.getByRole("status")).toContainText("tarjeta de ejemplo");
  });

  test("the owner sees received contacts and the switch in the editor", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Contactos recibidos" })).toBeVisible();
    await expect(page.locator("#contactos").getByText("Lucía Martín")).toBeVisible();
    await expect(page.getByRole("link", { name: "lucia@example.com" })).toHaveAttribute("href", "mailto:lucia@example.com");
    await expect(page.getByRole("switch", { name: "Recibir contactos" })).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("legal pages", () => {
  for (const [path, title] of [
    ["/aviso-legal", "Aviso legal"],
    ["/terminos", "Términos de uso"],
    ["/privacidad", "Privacidad"],
  ] as const) {
    test(`${path} renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Textos legales" })).toBeVisible();
    });
  }

  test("the privacy policy explains contact requests", async ({ page }) => {
    await page.goto("/privacidad#contactos");
    await expect(page.getByRole("heading", { name: "Si dejas tu contacto en una tarjeta" })).toBeVisible();
  });
});
