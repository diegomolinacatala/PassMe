import { expect, test } from "@playwright/test";

/**
 * The landing as an object you want: the pass tips with the pointer, the
 * motifs draw themselves, and "Hazla tuya" lets you make yours before signing up.
 */

test.describe("hero", () => {
  test("shows one big pass that is the sample card, with its real QR", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby='hero-title']");
    const pass = hero.getByLabel("Vista previa del pase de Apple Wallet de Alex Rivera");
    await expect(pass).toBeVisible();
    await expect(pass.getByRole("img", { name: "Código QR de la tarjeta" })).toBeVisible();
    // The motif is drawn in the browser (its path data never travels in the HTML) and draws itself in.
    await expect(pass.locator("svg path[style*='animation']").first()).toBeAttached();
  });

  test("tips toward the pointer on a computer and rests flat when it leaves", async ({ page, isMobile }) => {
    test.skip(isMobile, "a phone tilts with its sensors");
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby='hero-title']");
    const pass = hero.getByLabel("Vista previa del pase de Apple Wallet de Alex Rivera");
    const surface = pass.locator("xpath=..");
    const box = await pass.boundingBox();
    if (!box) throw new Error("pass not laid out");
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
    await expect.poll(async () => surface.evaluate((el) => el.style.transform)).toMatch(/rotateX\((?!0deg)[-\d.]+deg\) rotateY\((?!0deg)[-\d.]+deg\)/);
    await page.mouse.move(10, 10);
    await expect.poll(async () => surface.evaluate((el) => el.style.transform), { timeout: 5000 }).toBe("rotateX(0deg) rotateY(0deg)");
  });

  test("the hint under the pass is only for a desktop, and the header reaches every section", async ({ page, isMobile }) => {
    await page.goto("/");
    const hint = page.getByText("Pruébalo: escanéalo con tu móvil →");
    if (isMobile) await expect(hint).toBeHidden();
    else {
      await expect(hint).toBeVisible();
      const header = page.getByRole("banner");
      await expect(header.getByRole("link", { name: "Hazla tuya" })).toHaveAttribute("href", "#diseno");
      await expect(header.getByRole("link", { name: "Cómo funciona" })).toHaveAttribute("href", "#como-funciona");
    }
  });
});

test.describe("cómo funciona", () => {
  test("three frames of the real thing, in order", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#como-funciona");
    await expect(section.getByRole("heading", { level: 2 })).toContainText("Del bolsillo a su agenda");
    const steps = section.getByRole("listitem");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText("Vive en tu cartera");
    await expect(steps.nth(1)).toContainText("Enseñas el QR");
    await expect(steps.nth(2)).toContainText("Te guarda en un toque");
    // The frames are pictures: their contents are not announced.
    await expect(section.locator("[aria-hidden='true']").getByText("Contacto guardado")).toHaveCount(1);
  });
});

test.describe("hazla tuya", () => {
  test("the name, color, motif and typeface change the pass, and the link carries the design", async ({ page }) => {
    await page.goto("/#diseno");
    const section = page.locator("#diseno");
    const pass = section.getByLabel(/Vista previa del pase de Apple Wallet/);
    await expect(pass).toHaveAttribute("aria-label", "Vista previa del pase de Apple Wallet de Alex Rivera");

    await section.getByLabel("Tu nombre").fill("Lucía Ferrer");
    await expect(section.getByLabel("Vista previa del pase de Apple Wallet de Lucía Ferrer")).toBeVisible();

    await section.getByRole("radio", { name: "Café" }).check();
    await expect(section.getByLabel("Vista previa del pase de Apple Wallet de Lucía Ferrer")).toHaveCSS("background-color", "rgb(62, 44, 35)");

    await section.getByRole("radio", { name: "Corriente" }).check();
    await section.getByRole("radio", { name: "Cursiva" }).check();
    await expect(section.getByRole("radio", { name: "Corriente" })).toBeChecked();
    await expect(section.getByRole("radio", { name: "Cursiva" })).toBeChecked();

    const link = section.getByRole("link", { name: /Crear mi tarjeta con este diseño/ });
    await expect(link).toHaveAttribute("href", /^\/crear\?tema=cafe&motivo=corriente&letra=cursiva&variacion=\d+$/);
    // "Liso" has no variations: the dice are off.
    await section.getByRole("radio", { name: "Liso" }).check();
    await expect(section.getByRole("button", { name: "Otra variación" })).toBeDisabled();
    await section.getByRole("radio", { name: "Corriente" }).check();
    await expect(section.getByRole("button", { name: "Otra variación" })).toBeEnabled();
  });

  test("the chosen design and the typed name reach /crear, and get created with the card", async ({ page }) => {
    await page.goto("/#diseno");
    const section = page.locator("#diseno");
    await section.getByLabel("Tu nombre").fill("Lucía Ferrer");
    await section.getByRole("radio", { name: "Salvia" }).check();
    await section.getByRole("radio", { name: "Persiana" }).check();
    await section.getByRole("radio", { name: "Moderna" }).check();
    await section.getByRole("link", { name: /Crear mi tarjeta con este diseño/ }).click();

    await expect(page).toHaveURL(/\/crear\?tema=salvia&motivo=persiana&letra=moderna&variacion=\d+/);
    // The name travels in this browser's draft, never in the link.
    await expect(page.getByLabel("Nombre y apellidos")).toHaveValue("Lucía Ferrer");
    await expect(page.getByText("Salvia, motivo Persiana y letra Moderna. La foto, luego en el editor.")).toBeVisible();
    const preview = page.getByLabel("Vista previa del pase de Apple Wallet de Lucía Ferrer");
    await expect(preview).toHaveCSS("background-color", "rgb(205, 213, 189)");
    await expect(page.getByRole("radio", { name: "Salvia" })).toBeChecked();
  });

  test("a link with nonsense is treated as no design at all", async ({ page }) => {
    await page.goto("/crear?tema=neon&motivo=sello&letra=comic&variacion=x");
    await expect(page.getByRole("radiogroup", { name: "Color de tu tarjeta" }).getByRole("radio", { checked: true })).toHaveCount(1);
    // Any theme name (accents included: «Melocotón», «Café»), and the default hint.
    await expect(page.getByText(/^\p{L}+\. Motivo, letra y foto, luego en el editor\.$/u)).toBeVisible();
    // One good value is kept; the rest are the defaults.
    await page.goto("/crear?tema=neon&motivo=cinta");
    await expect(page.getByRole("radio", { name: "Naranja" })).toBeChecked();
    await expect(page.getByText("Naranja, motivo Cinta y letra Clásica. La foto, luego en el editor.")).toBeVisible();
  });
});

test("the public card's stub carries the light, the editor's preview doesn't", async ({ page }) => {
  await page.goto("/u/demo");
  const card = page.getByLabel("Tarjeta de Alex Rivera");
  await expect(card.locator("header > div[aria-hidden='true'].pointer-events-none").first()).toBeAttached();
  await page.goto("/dashboard");
  await page.getByRole("tab", { name: "Al escanear" }).click();
  await expect(page.getByRole("tabpanel").getByLabel("Tarjeta de Alex Rivera")).toBeVisible();
  await expect(page.getByRole("tabpanel").locator("header > div[aria-hidden='true'].pointer-events-none")).toHaveCount(0);
});
