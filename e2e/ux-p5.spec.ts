import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/** Block P5 of the 2026-10-05 UX audit: the public card, as whoever scans it sees it. Demo mode. */

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

/** Leaving the tab (to open the downloaded file) and coming back. */
async function leaveAndReturn(page: Page) {
  await page.evaluate(() => {
    const flip = (state: "hidden" | "visible") => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    flip("hidden");
    flip("visible");
  });
}

async function filledButtonsOnFirstScreen(page: Page): Promise<string[]> {
  return page.locator(".btn-signal, .btn-ink, .btn-paper").evaluateAll((els) =>
    els
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.top < window.innerHeight && box.bottom > 0;
      })
      .map((el) => el.textContent?.trim() ?? ""),
  );
}

async function sendDemoMeeting(page: Page) {
  await page.getByRole("button", { name: /Agendar reunión con Alex/ }).click();
  await page.getByRole("group", { name: "Día" }).getByRole("button").nth(2).click();
  await page.getByRole("button", { name: /^10:00,/ }).click();
  await page.getByRole("button", { name: "Continuar con 1 hora" }).click();
  await page.getByLabel("Nombre").fill("Lucía Martín");
  await page.getByLabel("Email").fill("lucia@example.com");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Enviar propuesta" }).click();
  await expect(page.getByRole("status")).toContainText("Propuesta enviada a Alex.");
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("not rendered");
  return b;
}

test.describe("P5.1 the other person's card is the star", () => {
  test("only «Guardar contacto» is filled on the first screen", async ({ page }) => {
    // iPhone 15 and Pixel 7.
    for (const viewport of [
      { width: 393, height: 852 },
      { width: 412, height: 839 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/u/demo?src=qr");
      const create = page.getByRole("link", { name: "Crear la mía" });
      await expect(create).toHaveClass(/btn-outline/);
      expect((await box(create)).height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole("link", { name: "Guardar contacto" })).toHaveClass(/btn-signal/);
      expect(await filledButtonsOnFirstScreen(page)).toEqual(["Guardar contacto"]);
    }
    // The dark closing block stays, with a paper button.
    const cta = page.getByRole("region", { name: /Ten tu tarjeta así/ });
    await expect(cta.getByRole("link", { name: "Crear mi tarjeta" })).toHaveClass(/btn-paper/);
  });
});

test.describe("P5.2 secondary actions", () => {
  test("«Déjale tu contacto» first, both collapsed, described and closable", async ({ page }) => {
    await page.goto("/u/demo");
    const triggers = page.locator("button[aria-controls]");
    await expect(triggers.first()).toHaveAccessibleName("Déjale tu contacto a Alex");
    await expect(triggers.first()).toHaveAttribute("aria-expanded", "false");
    await expect(triggers.first()).toHaveAccessibleDescription("Así también tiene el tuyo. Tardas 20 segundos.");
    const meeting = page.getByRole("button", { name: "Agendar reunión con Alex" });
    await expect(meeting).toHaveAccessibleName("Agendar reunión con Alex");

    // Opening one closes the other.
    await triggers.first().click();
    await expect(page.getByRole("heading", { name: "Déjale tu contacto a Alex" })).toBeVisible();
    await meeting.click();
    await expect(page.getByRole("heading", { name: "¿Cuándo os veis?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Déjale tu contacto a Alex" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Déjale tu contacto a Alex" })).toBeVisible();

    // «Cerrar» folds it and gives the focus back.
    const close = page.getByRole("button", { name: "Cerrar" });
    const size = await box(close);
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(page.getByRole("button", { name: "Agendar reunión con Alex" })).toBeFocused();
    await expect(page.getByRole("heading", { name: "¿Cuándo os veis?" })).toHaveCount(0);
  });
});

test.describe("P5.3 «Guardar contacto» answers back", () => {
  test("outside iOS it names the file, then turns into «Contacto guardado»", async ({ page }) => {
    await page.goto("/u/demo?src=qr");
    await expect(page.getByRole("button", { name: "Compartir tarjeta" })).toHaveCount(0);
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Guardar contacto" }).click();
    expect((await download).suggestedFilename()).toBe("Alex Rivera.vcf");
    await expect(page.getByRole("article").getByText("Casi está. Abre Alex Rivera.vcf para guardarlo en tus contactos.")).toBeVisible();
    await expect(page.getByRole("link", { name: "¿No lo ves? Volver a descargar" })).toHaveAttribute("href", "/u/demo/vcard?src=qr");

    await leaveAndReturn(page);
    const saved = page.getByRole("link", { name: "Contacto guardado" });
    await expect(saved).toHaveClass(/btn-outline/);
    const giveYours = page.getByRole("button", { name: "Déjale el tuyo a Alex" });
    await expect(giveYours).toBeInViewport();
    await expect(page.getByRole("link", { name: "Crear mi tarjeta" }).first()).toHaveAttribute("href", "/crear?de=demo&via=qr");

    await giveYours.click();
    await expect(page.getByLabel("Nombre")).toBeFocused();
  });


  test("«Pasarle esta tarjeta a alguien» copies the link where there's no share sheet", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "share", { value: undefined, configurable: true }));
    await page.goto("/u/demo");
    await page.getByRole("button", { name: "Pasarle esta tarjeta a alguien" }).click();
    await expect(page.getByRole("button", { name: "Enlace copiado" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/u\/demo\?src=share$/);
  });
});

test.describe("P5.3 on iPhone", () => {
  test.use({ userAgent: IPHONE_UA });

  test("the tap itself is enough", async ({ page }) => {
    // Safari would show its "add contact" screen; here the vCard just doesn't navigate.
    await page.route("**/u/demo/vcard**", (route) => route.fulfill({ status: 204 }));
    await page.goto("/u/demo");
    await page.getByRole("link", { name: "Guardar contacto" }).click();
    await expect(page.getByRole("link", { name: "Contacto guardado" })).toBeVisible();
    await expect(page.getByText(/Casi está/)).toHaveCount(0);
  });
});

test.describe("P5.4 large text and narrow screens", () => {
  test("at 360 px and 130 % text nothing is cut or scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/u/demo");
    await page.addStyleTag({ content: "html{font-size:130%}" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const save = await box(page.getByRole("link", { name: "Guardar contacto" }));
    expect(save.x).toBeGreaterThanOrEqual(0);
    expect(save.x + save.width).toBeLessThanOrEqual(360);
    const email = page.getByText("alex@example.com", { exact: true });
    const fits = await email.evaluate((el) => el.scrollWidth <= el.clientWidth && getComputedStyle(el).textOverflow !== "ellipsis");
    expect(fits).toBe(true);
    const emailBox = await box(email);
    expect(emailBox.x + emailBox.width).toBeLessThanOrEqual(360);
  });

  test("no «Tarjeta de contacto» label on the card", async ({ page }) => {
    await page.goto("/u/demo");
    await expect(page.getByRole("article", { name: "Tarjeta de Alex Rivera" })).toBeVisible();
    await expect(page.getByText("Tarjeta de contacto", { exact: true })).toHaveCount(0);
  });

  test("on a phone held sideways «Guardar contacto» peeks on the first screen", async ({ page }) => {
    await page.setViewportSize({ width: 839, height: 412 });
    await page.goto("/u/demo");
    const save = await box(page.getByRole("link", { name: "Guardar contacto" }));
    expect(save.y).toBeLessThan(412);
  });
});

test.describe("P5.5 each row says what it does", () => {
  test("call, write, open and WhatsApp", async ({ page }) => {
    await page.goto("/u/demo");
    await expect(page.getByRole("link", { name: /\+34 612 345 678\s*Llamar/ })).toHaveAttribute("href", "tel:+34612345678");
    await expect(page.getByRole("link", { name: /alex@example\.com\s*Escribir/ })).toHaveAttribute("href", "mailto:alex@example.com");
    await expect(page.getByRole("link", { name: /in\/alex-rivera-demo\s*Abrir/ })).toHaveAttribute("target", "_blank");
    const whatsapp = page.getByRole("link", { name: /^WhatsApp a \+34 612 345 678/ });
    await expect(whatsapp).toHaveAttribute("href", "https://wa.me/34612345678");
    const size = await box(whatsapp);
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("P5.6 «Déjale tu contacto» in a few taps", () => {
  test("name, mobile, email; both marked when neither is there; folded extras", async ({ page }) => {
    await page.goto("/u/demo");
    await page.getByRole("button", { name: "Déjale tu contacto a Alex" }).click();
    const form = page.locator("form");
    await expect(form.getByText("Con el móvil o el email basta.")).toBeVisible();
    expect(await form.locator("input:not([type=hidden]):not([type=checkbox]):not([name=website])").evaluateAll((els) => els.map((el) => (el as HTMLInputElement).name))).toEqual([
      "name",
      "phone",
      "email",
    ]);
    await expect(page.getByLabel("Empresa")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Más info/ })).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("link", { name: /Más info/ })).toHaveAttribute("href", "/privacidad#contactos");
    expect((await box(page.locator("label:has(input[type=checkbox])"))).height).toBeGreaterThanOrEqual(44);

    await page.getByRole("button", { name: "Dejarle mi contacto" }).click();
    await expect(page.getByLabel("Móvil", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Deja tu móvil o tu email: con uno basta.")).toHaveCount(1);
    // The checkbox's error sits right by the button.
    const nearButton = page.locator("div:has(> button[type=submit])");
    await expect(nearButton.getByText("Marca la casilla para poder enviar tus datos.")).toBeVisible();
    expect(await new AxeBuilder({ page }).include("form").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze().then((r) => r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id))).toEqual([]);

    await page.getByRole("button", { name: "Añadir empresa o un mensaje" }).click();
    await expect(page.getByLabel("Empresa")).toBeFocused();
    await page.getByLabel("Mensaje").fill("x".repeat(399));
    await expect(page.getByText("399/500")).toHaveCount(0);
    await page.getByLabel("Mensaje").fill("x".repeat(400));
    await expect(page.getByText("400/500")).toBeVisible();
  });

  test("what was typed survives closing the panel and reloading", async ({ page }) => {
    await page.goto("/u/demo");
    await page.getByRole("button", { name: "Déjale tu contacto a Alex" }).click();
    await page.getByLabel("Nombre").fill("Lucía Martín");
    await page.getByLabel("Móvil", { exact: true }).fill("+34 611 22 33 44");
    await page.getByRole("button", { name: "Cerrar" }).click();
    await expect(page.getByRole("button", { name: "Déjale tu contacto a Alex" })).toBeFocused();
    await page.reload();
    await page.getByRole("button", { name: "Déjale tu contacto a Alex" }).click();
    await expect(page.getByLabel("Nombre")).toHaveValue("Lucía Martín");
    await expect(page.getByLabel("Móvil", { exact: true })).toHaveValue("+34 611 22 33 44");
  });

  test("the confirmation answers by channel and never says «tenemos tus datos»", async ({ page }) => {
    await page.goto("/u/demo");
    await page.getByRole("button", { name: "Déjale tu contacto a Alex" }).click();
    await page.getByLabel("Nombre").fill("Lucía Martín");
    await page.getByLabel("Móvil", { exact: true }).fill("+34 611 22 33 44");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Dejarle mi contacto" }).click();
    const sent = page.getByRole("status");
    await expect(sent).toContainText("Alex te llamará o te escribirá cuando pueda.");
    await expect(sent).toContainText("Empieza con lo que acabas de escribir.");
    await expect(page.getByText(/tenemos tus datos/i)).toHaveCount(0);

    await page.goto("/u/demo?src=share");
    await page.getByRole("button", { name: "Déjale tu contacto a Alex" }).click();
    await page.getByLabel("Nombre").fill("Lucía Martín");
    await page.getByLabel("Móvil", { exact: true }).fill("");
    await page.getByLabel("Email").fill("lucia@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Dejarle mi contacto" }).click();
    await expect(page.getByRole("status")).toContainText("Alex te escribirá cuando pueda.");
  });
});

test.describe("P5.7 after sending, one call to create", () => {
  async function visibleSignals(page: Page) {
    return page.locator(".btn-signal").evaluateAll((els) => els.filter((el) => el.getClientRects().length > 0).length);
  }

  test("after leaving your contact the dark block goes; one orange button left", async ({ page }) => {
    await page.goto("/u/demo");
    await page.getByRole("button", { name: "Déjale tu contacto a Alex" }).click();
    await page.getByLabel("Nombre").fill("Lucía Martín");
    await page.getByLabel("Email").fill("lucia@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Dejarle mi contacto" }).click();
    await expect(page.getByRole("status")).toContainText("Alex ya tiene tu contacto.");
    await expect(page.getByRole("region", { name: /Ten tu tarjeta así/ })).toHaveCount(0);
    expect(await visibleSignals(page)).toBe(1);
  });

  test("after a meeting proposal «Déjale tu contacto» goes too", async ({ page }) => {
    await page.goto("/u/demo");
    await sendDemoMeeting(page);
    await expect(page.getByRole("button", { name: "Déjale tu contacto a Alex" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: /Ten tu tarjeta así/ })).toHaveCount(0);
    expect(await visibleSignals(page)).toBe(1);
  });
});

test.describe("P5.8 on a computer, the QR to take it to the phone", () => {
  test("a QR of the card next to it from 1024 px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/u/demo");
    const qr = page.getByRole("img", { name: "Código QR de la tarjeta de Alex Rivera" });
    await expect(qr).toBeVisible();
    await expect(page.locator("figure[data-qr-value]")).toHaveAttribute("data-qr-value", /\/u\/demo\?src=qr$/);
    await expect(page.getByText("Escanéalo con tu móvil para guardar a")).toBeVisible();

    await page.setViewportSize({ width: 900, height: 900 });
    await expect(qr).toBeHidden();
  });
});
