import { expect, test, type Page } from "@playwright/test";

/**
 * Block P4 of the 2026-10-05 UX audit: creating the card without extra steps.
 * Demo mode: no email is sent and the code is 00000000.
 */

async function fillCard(page: Page, email = "lucia@example.com") {
  await page.getByLabel("Nombre y apellidos").fill("Lucía Ferrer");
  await page.getByLabel("Cargo").fill("Directora de hotel");
  await page.getByLabel("Email", { exact: true }).fill(email);
}

/** Waits until the draft has been written (it's saved 300 ms after the last change). */
async function waitForSavedDraft(page: Page, text: string) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("passme:quick-draft") ?? "")).toContain(text);
}

test.describe("P4.1 «Crear mi tarjeta» sends the code", () => {
  test("without an email in the card it continues to the email step", async ({ page }) => {
    await page.goto("/crear");
    await page.getByLabel("Nombre y apellidos").fill("Lucía Ferrer");
    await page.getByLabel("Móvil").fill("+34 611 22 33 44");
    await expect(page.getByRole("button", { name: "Crear mi tarjeta" })).toHaveCount(0);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("heading", { name: /Guárdala con tu email/ })).toBeVisible();
    await page.getByLabel("Tu email").fill("lucia@example.com");
    await page.getByRole("button", { name: "Enviarme un código" }).click();
    await expect(page.getByRole("heading", { name: /Escribe el código/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear mi tarjeta" })).toBeDisabled();
  });

  test("«Usar otro email» sends the code elsewhere and keeps the card's email", async ({ page }) => {
    await page.goto("/crear");
    await fillCard(page, "reservas@hotelmirador.es");
    await page.getByRole("button", { name: "Usar otro email" }).click();
    const other = page.getByLabel("Email para guardarla");
    await expect(other).toBeFocused();
    await other.fill("lucia@example.com");
    await page.getByRole("button", { name: "Crear mi tarjeta" }).click();
    await expect(page.getByText("lucia@example.com", { exact: true }).locator("visible=true")).toBeVisible();

    await page.getByRole("button", { name: "Editar mis datos" }).click();
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("reservas@hotelmirador.es");
  });
});

test.describe("P4.2 / P4.3 nothing is lost on a reload", () => {
  test("the form comes back as it was", async ({ page }) => {
    await page.goto("/crear?de=demo");
    await fillCard(page);
    await page.getByRole("radio", { name: "Salvia" }).click();
    await waitForSavedDraft(page, "salvia");

    await page.reload();
    await expect(page.getByLabel("Nombre y apellidos")).toHaveValue("Lucía Ferrer");
    await expect(page.getByLabel("Cargo")).toHaveValue("Directora de hotel");
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("lucia@example.com");
    await expect(page.getByRole("radio", { name: "Salvia" })).toBeChecked();
    // Still the form: nothing was asked for yet.
    await expect(page.getByRole("button", { name: "Crear mi tarjeta" })).toBeVisible();
  });

  test("a code already asked for: straight back to the 8 boxes", async ({ page }) => {
    await page.goto("/crear?de=demo");
    await fillCard(page);
    await page.getByRole("button", { name: "Crear mi tarjeta" }).click();
    await expect(page.getByText("¡Código enviado!")).toBeVisible();
    await waitForSavedDraft(page, "codeSentAt\":1");

    await page.reload();
    await expect(page.getByText("Ya te enviamos un código")).toBeVisible();
    await expect(page.getByText("lucia@example.com", { exact: true }).locator("visible=true")).toBeVisible();
    await page.getByLabel("Código de 8 cifras").fill("00000000");
    await page.waitForURL(/\/dashboard\?nueva=1&de=demo/);
  });

  test("«Editar mis datos» and back: the same code, no new email", async ({ page }) => {
    await page.goto("/crear");
    await fillCard(page);
    await page.getByRole("button", { name: "Crear mi tarjeta" }).click();
    await expect(page.getByLabel("Código de 8 cifras")).toBeFocused();

    await page.getByRole("button", { name: "Editar mis datos" }).click();
    await page.getByLabel("Cargo").fill("Gerente");
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await page.getByRole("button", { name: "Crear mi tarjeta" }).click();
    await expect(page.getByLabel("Código de 8 cifras")).toBeVisible();
    await expect(page.getByText("¡Código enviado!")).toBeVisible();
    expect(posts).toEqual([]);
  });
});

test("P4.4 a card made from someone else's doesn't start with their color", async ({ page }) => {
  // The demo card is Naranja.
  await page.goto("/crear?de=demo");
  await expect(page.getByRole("radio", { checked: true })).not.toHaveAccessibleName("Naranja");
});

test.describe("P4.6 email typos", () => {
  test("/login suggests the right domain before sending", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Tu email").fill("carlos@gmial.com");
    await expect(page.getByText("¿Querías decir carlos@gmail.com?")).toBeVisible();
    await page.getByRole("button", { name: "Sí, corregir" }).click();
    await expect(page.getByLabel("Tu email")).toHaveValue("carlos@gmail.com");
    await expect(page.getByText(/¿Querías decir/)).toHaveCount(0);
  });

  test("/crear fixes the card's email too", async ({ page }) => {
    await page.goto("/crear");
    await fillCard(page, "lucia@hotmial.com");
    await expect(page.getByText("¿Querías decir lucia@hotmail.com?")).toBeVisible();
    await page.getByRole("button", { name: "Sí, corregir" }).click();
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("lucia@hotmail.com");
    await expect(page.getByText("Te mandaremos un código a lucia@hotmail.com para guardarla.")).toBeVisible();
  });
});
