import { expect, test } from "@playwright/test";

/** Editor in demo mode (no Supabase configured): everything works locally, nothing persists. */
test.describe("editor (demo mode)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Modo demo.", { exact: false })).toBeVisible();
  });

  test("live-updates the wallet preview while typing", async ({ page }) => {
    const name = page.getByLabel("Nombre y apellidos");
    await name.fill("Lucía Ferrer");
    await expect(page.getByLabel(/Vista previa del pase de Apple Wallet de Lucía Ferrer/).locator("visible=true")).toBeVisible();

    await page.getByRole("tab", { name: "Google Wallet" }).locator("visible=true").click();
    await expect(page.getByLabel(/Vista previa del pase de Google Wallet de Lucía Ferrer/).locator("visible=true")).toBeVisible();

    await page.getByRole("tab", { name: "Al escanear" }).locator("visible=true").click();
    await expect(page.getByRole("heading", { name: "Lucía Ferrer" })).toBeVisible();
  });

  test("validates contacts inline", async ({ page }) => {
    await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
    const input = page.getByLabel("WhatsApp: valor");
    await expect(input).toBeFocused();
    await input.fill("600 11 22 33");
    await input.blur();
    await expect(page.getByText("Incluye el prefijo internacional (ej. +34).")).toBeVisible();

    await input.fill("+34 600 11 22 33");
    await expect(page.getByText("Incluye el prefijo internacional (ej. +34).")).toHaveCount(0);
  });

  test("hides a contact from the public preview", async ({ page }) => {
    await page.getByRole("tab", { name: "Al escanear" }).locator("visible=true").click();
    const panel = page.locator("[role=tabpanel]:visible");
    await expect(panel.getByText("alex@example.com")).toBeVisible();

    await page.getByRole("button", { name: "Ocultar de la tarjeta" }).first().click();
    await expect(panel.getByText("alex@example.com")).toHaveCount(0);
  });

  test("changes the card theme, motif, variation and typeface", async ({ page }) => {
    await page.getByRole("radio", { name: "Café" }).click();
    await expect(page.getByRole("radio", { name: "Café" })).toHaveAttribute("aria-checked", "true");
    const pass = page.getByLabel(/Vista previa del pase de Apple Wallet/).locator("visible=true");
    await expect(pass).toHaveCSS("background-color", "rgb(62, 44, 35)");

    await page.getByRole("radio", { name: "Corriente" }).click();
    await expect(page.getByRole("radio", { name: "Corriente" })).toHaveAttribute("aria-checked", "true");

    // Variations re-roll the motif and can be undone; no number is ever shown.
    const previous = page.getByRole("button", { name: "Volver a la variación anterior" });
    await expect(previous).toBeDisabled();
    await page.getByRole("button", { name: "Otra variación" }).click();
    await expect(previous).toBeEnabled();
    await expect(pass.getByText(/Nº/)).toHaveCount(0);

    // Letter-only motifs have no variations.
    await page.getByRole("radio", { name: "Monograma" }).click();
    await expect(page.getByRole("button", { name: "Otra variación" })).toBeDisabled();

    await page.getByRole("radio", { name: "Editorial" }).click();
    await expect(page.getByRole("radio", { name: "Editorial" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("status")).toContainText("Cambios sin guardar");
  });

  test("tracks unsaved changes and 'saves' in demo mode", async ({ page }) => {
    const status = page.getByRole("status");
    await expect(status).toContainText("Todo guardado");
    await page.getByLabel("Cargo").fill("Head of Design");
    await expect(status).toContainText("Cambios sin guardar");
    await status.getByRole("button", { name: "Guardar" }).click();
    await expect(status).toContainText("Modo demo");
  });

  test("blocks saving with invalid data", async ({ page }) => {
    await page.getByLabel("Nombre y apellidos").fill("");
    await page.getByRole("status").getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Tu nombre es obligatorio.")).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Revisa los campos");
  });
});

test("login explains the demo code when Supabase is not configured", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Entra en tu tarjeta");
  await expect(page.getByText(/Modo demo\..*el código es 00000000/)).toBeVisible();
});
