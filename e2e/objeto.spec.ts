import { expect, test } from "@playwright/test";

/**
 * The landing is the card, already yours: type a name, pick a design, and
 * "Crear mi tarjeta" carries it into /crear. Nothing asks for permissions.
 */

const HERO = "section[aria-labelledby='hero-title']";

test.describe("hero", () => {
  test("is the sample pass with its real QR, and the motif draws itself", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator(HERO);
    const pass = hero.getByLabel("Vista previa del pase de Apple Wallet de Alex Rivera");
    await expect(pass).toBeVisible();
    await expect(pass.getByRole("img", { name: "Código QR de la tarjeta" })).toBeVisible();
    // The motif is drawn in the browser (its path data never travels in the HTML) and draws itself in.
    await expect(pass.locator("svg path[style*='animation']").first()).toBeAttached();
  });

  test("tips toward the pointer on a computer; on a phone it stays still", async ({ page, isMobile }) => {
    await page.goto("/");
    const pass = page.locator(HERO).getByLabel("Vista previa del pase de Apple Wallet de Alex Rivera");
    const surface = pass.locator("xpath=..");
    const box = await pass.boundingBox();
    if (!box) throw new Error("pass not laid out");
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
    if (isMobile) {
      await page.waitForTimeout(600);
      expect(await surface.evaluate((el) => el.style.transform)).toBe("");
      return;
    }
    await expect.poll(async () => surface.evaluate((el) => el.style.transform)).toMatch(/rotateX\((?!0deg)[-\d.]+deg\) rotateY\((?!0deg)[-\d.]+deg\)/);
    await page.mouse.move(10, 10);
    await expect.poll(async () => surface.evaluate((el) => el.style.transform), { timeout: 5000 }).toBe("rotateX(0deg) rotateY(0deg)");
  });

  test("never asks for motion or orientation permissions", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __asked: number; DeviceOrientationEvent: { requestPermission?: () => Promise<string> } };
      w.__asked = 0;
      w.DeviceOrientationEvent.requestPermission = () => {
        w.__asked += 1;
        return Promise.resolve("denied");
      };
    });
    await page.goto("/");
    // Force: on a computer the pass sways slowly, so Playwright would wait forever for it to hold still.
    await page.locator(HERO).getByLabel("Vista previa del pase de Apple Wallet de Alex Rivera").click({ force: true });
    await page.goto("/u/demo");
    await page.getByRole("heading", { name: "Alex Rivera" }).click();
    expect(await page.evaluate(() => (window as unknown as { __asked: number }).__asked)).toBe(0);
  });

  test("the scan hint is only for a desktop", async ({ page, isMobile }) => {
    await page.goto("/");
    const hint = page.getByText("Pruébalo: escanéalo con tu móvil →");
    if (isMobile) await expect(hint).toBeHidden();
    else await expect(hint).toBeVisible();
  });
});

test.describe("hazla tuya (in the hero)", () => {
  test("the name, color, motif and typeface change the pass, and the link carries the design", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator(HERO);
    await hero.getByLabel("Tu nombre").fill("Lucía Ferrer");
    await expect(hero.getByLabel("Vista previa del pase de Apple Wallet de Lucía Ferrer")).toBeVisible();

    await hero.getByRole("radio", { name: "Café" }).check();
    await expect(hero.getByLabel("Vista previa del pase de Apple Wallet de Lucía Ferrer")).toHaveCSS("background-color", "rgb(62, 44, 35)");

    await hero.getByRole("radio", { name: "Corriente" }).check();
    await hero.getByRole("radio", { name: "Cursiva" }).check();
    await expect(hero.getByRole("radio", { name: "Corriente" })).toBeChecked();
    await expect(hero.getByRole("radio", { name: "Cursiva" })).toBeChecked();

    const link = hero.getByRole("link", { name: "Crear mi tarjeta" }).first();
    await expect(link).toHaveAttribute("href", /^\/crear\?tema=cafe&motivo=corriente&letra=cursiva&variacion=\d+$/);
    // "Liso" has no variations: the dice are off.
    await hero.getByRole("radio", { name: "Liso" }).check();
    await expect(hero.getByRole("button", { name: "Otra variación" })).toBeDisabled();
    await hero.getByRole("radio", { name: "Corriente" }).check();
    await expect(hero.getByRole("button", { name: "Otra variación" })).toBeEnabled();
  });

  test("the chosen design and the typed name reach /crear", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator(HERO);
    await hero.getByLabel("Tu nombre").fill("Lucía Ferrer");
    await hero.getByRole("radio", { name: "Salvia" }).check();
    await hero.getByRole("radio", { name: "Persiana" }).check();
    await hero.getByRole("radio", { name: "Moderna" }).check();
    await hero.getByRole("link", { name: "Crear mi tarjeta" }).first().click();

    await expect(page).toHaveURL(/\/crear\?tema=salvia&motivo=persiana&letra=moderna&variacion=\d+/);
    // The name travels in this browser's draft, never in the link.
    await expect(page.getByLabel("Nombre y apellidos")).toHaveValue("Lucía Ferrer");
    await expect(page.getByText("Salvia, motivo Persiana y letra Moderna. La foto, luego en el editor.")).toBeVisible();
    await expect(page.getByLabel("Vista previa del pase de Apple Wallet de Lucía Ferrer")).toHaveCSS("background-color", "rgb(205, 213, 189)");
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

  test("on a phone, «Crear mi tarjeta» follows you in a bottom bar once the inline one scrolls away", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the bar is for phones");
    await page.goto("/");
    const hero = page.locator(HERO);
    await hero.getByLabel("Tu nombre").fill("Lucía Ferrer");
    await hero.getByRole("radio", { name: "Café" }).check();
    const bar = hero.locator("div.fixed.bottom-0");
    // The inline button is in view (centered on screen): the bar stays away.
    await hero.getByRole("link", { name: "Crear mi tarjeta" }).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await expect(bar).toHaveAttribute("aria-hidden", "true");
    // Far below: the bar comes up with the chosen design, and the same link.
    await page.locator("#preguntas").scrollIntoViewIfNeeded();
    await expect(bar).toHaveAttribute("aria-hidden", "false");
    await expect(bar).toContainText("Lucía Ferrer");
    await expect(bar).toContainText("Café");
    await expect(bar.getByRole("link", { name: "Crear mi tarjeta" })).toHaveAttribute("href", /^\/crear\?tema=cafe&motivo=arco&letra=clasica&variacion=\d+$/);
    // Never a second orange button: the bar's is Café.
    await expect(bar.getByRole("link", { name: "Crear mi tarjeta" })).not.toHaveClass(/btn-signal/);
  });
});

test.describe("cómo funciona", () => {
  test("three frames of the real thing, in order, and a strip to swipe on a phone", async ({ page, isMobile }) => {
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
    if (isMobile) {
      const strip = section.getByRole("list");
      expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    }
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
