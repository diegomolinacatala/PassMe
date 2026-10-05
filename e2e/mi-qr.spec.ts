import { expect, test, type Page } from "@playwright/test";

/**
 * Block P2 of the 2026-10-05 UX audit: «Mi QR» and coming back to the product.
 * Demo mode: the editor is the sample card (slug "demo"), nothing persists, and
 * Google Wallet is off (GOOGLE_WALLET_LIVE unset). The "mobile" project is a Pixel 7.
 */

const IPHONE_SIZE = { width: 393, height: 659 };

/** Fills /crear, gets through the demo code and lands on the welcome. */
async function createCardFrom(page: Page, cardUrl: string, expectedCreate: string) {
  await page.goto(cardUrl);
  await expect(page.getByRole("link", { name: "Crear la mía" })).toHaveAttribute("href", expectedCreate);
  await page.getByRole("link", { name: "Crear la mía" }).click();
  await page.waitForURL((url) => `${url.pathname}${url.search}` === expectedCreate);
  await page.getByLabel("Nombre y apellidos").fill("Lucía Ferrer");
  await page.getByLabel("Email").fill("lucia@example.com");
  await page.getByRole("button", { name: "Crear mi tarjeta" }).click();
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  await page.getByLabel("Código de 8 cifras").fill("00000000");
  await page.waitForURL(/\/dashboard\?nueva=1/);
  return page.getByRole("region", { name: /Ya tienes tu tarjeta/ });
}

test.describe("«Mi QR» full screen", () => {
  test("is one tap from the editor and shows the saved card", async ({ page, isMobile }) => {
    await page.goto("/dashboard");
    // An unsaved change to the card's link: the QR must keep pointing at the saved one.
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByLabel("Enlace de tu tarjeta").fill("otro-enlace");
    await page.getByRole("link", { name: "Mi QR", exact: true }).click();
    await page.waitForURL(/\/dashboard\/qr$/);

    await expect(page.getByRole("heading", { level: 1, name: "Alex Rivera" })).toBeVisible();
    const qr = page.getByRole("img", { name: "QR de la tarjeta de Alex Rivera" });
    await expect(qr).toBeInViewport({ ratio: 1 });
    const box = (await qr.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(isMobile ? 280 : 400);
    await expect(page.getByText("Sube el brillo para que se lea a la primera")).toBeVisible();
    await expect(page.getByText(/\/u\/demo$/)).toBeVisible();
    await expect(page.getByText(/otro-enlace/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Compartir|Copiar enlace)$/ })).toBeVisible();
    // Nothing else on screen: no site header, no save bar.
    await expect(page.getByRole("link", { name: "Mi QR", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Guardar", exact: true })).toHaveCount(0);

    await expect(page.getByRole("link", { name: "Cerrar" })).toHaveAttribute("href", "/dashboard");
    await page.getByRole("link", { name: "Cerrar" }).click();
    await page.waitForURL(/\/dashboard$/);
  });

  test("keeps the screen awake while it's open", async ({ page }) => {
    await page.addInitScript(() => {
      const calls: string[] = [];
      Object.defineProperty(window, "wakeCalls", { value: calls });
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
          request: async (type: string) => {
            calls.push(type);
            return { release: async () => undefined, addEventListener: () => undefined };
          },
        },
      });
    });
    await page.goto("/dashboard/qr");
    await expect.poll(() => page.evaluate(() => (window as unknown as { wakeCalls: string[] }).wakeCalls)).toEqual(["screen"]);
  });

  test("nothing covers the QR in landscape", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone landscape");
    await page.setViewportSize({ width: 839, height: 412 });
    await page.goto("/dashboard/qr");
    const qr = page.getByRole("img", { name: /QR de la tarjeta/ });
    await expect(qr).toBeInViewport({ ratio: 1 });
    const q = (await qr.boundingBox())!;
    const close = (await page.getByRole("link", { name: "Cerrar" }).boundingBox())!;
    const overlaps = close.x < q.x + q.width && q.x < close.x + close.width && close.y < q.y + q.height && q.y < close.y + close.height;
    expect(overlaps).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });

  test("Android without Google Wallet learns to pin it to the home screen, once", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Android user agent");
    await page.goto("/dashboard/qr");
    const hint = page.getByText("Añádela a tu pantalla de inicio: ⋮ → Añadir a pantalla de inicio");
    await expect(hint).toBeVisible();
    await page.getByRole("button", { name: "Entendido, no volver a mostrar" }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("img", { name: /QR de la tarjeta/ })).toBeVisible();
    await expect(hint).toHaveCount(0);
  });

  test("copies the link where there's no share sheet, and says so once", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => {
      // A browser without Web Share (e.g. Firefox on a computer).
      delete (Navigator.prototype as { share?: unknown }).share;
    });
    await page.goto("/dashboard/qr");
    await page.getByRole("button", { name: "Copiar enlace" }).click();
    await expect(page.getByRole("button", { name: "Enlace copiado" })).toBeVisible();
    await expect(page.locator("#passme-live")).toHaveText("Enlace copiado");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/u\/demo\?src=share$/);
  });
});

test.describe("editor: actions on top", () => {
  test("the phone's wallet action is visible without scrolling", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout");
    await page.setViewportSize(IPHONE_SIZE);
    await page.goto("/dashboard");
    // Android with Google Wallet off: the QR takes the wallet button's place.
    await expect(page.getByRole("link", { name: "Guardar mi QR en el móvil" }).first()).toBeInViewport();
    await expect(page.getByRole("link", { name: "Guardar mi QR en el móvil" }).first()).toHaveAttribute("href", "/dashboard/qr");
    await expect(page.getByRole("link", { name: /^Ver mi tarjeta/ }).first()).toBeVisible();
  });

  test("'Ver mi tarjeta' warns that unsaved changes aren't there yet", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout");
    await page.goto("/dashboard");
    const view = page.getByRole("link", { name: /^Ver mi tarjeta/ }).first();
    await expect(view).not.toContainText("sin tus cambios");
    await page.getByLabel("Cargo").fill("Head of Design");
    await expect(view).toContainText("(sin tus cambios)");
  });

  test("what's waiting shows up first, with a way to answer", async ({ page }) => {
    await page.setViewportSize(IPHONE_SIZE);
    await page.goto("/dashboard");
    const meeting = page.getByRole("listitem").filter({ hasText: "te ha propuesto una reunión" });
    await expect(meeting).toBeInViewport();
    await expect(meeting).toContainText("Lucía Martín");
    await expect(meeting.getByRole("link", { name: "Responder" })).toHaveAttribute("href", "/reunion/demo/anfitrion");

    // Contacts count as seen once "Ver" is pressed (remembered in this browser).
    const contact = page.getByRole("listitem").filter({ hasText: "te ha dejado su contacto" });
    await expect(contact).toBeVisible();
    await contact.getByRole("link", { name: "Ver" }).click();
    await expect(page).toHaveURL(/#contactos$/);
    await expect(contact).toHaveCount(0);
    await page.reload();
    await expect(meeting).toBeVisible();
    await expect(contact).toHaveCount(0);
  });

  test("the account menu signs out in two taps and closes with Escape", async ({ page }) => {
    await page.goto("/dashboard");
    const trigger = page.getByRole("button", { name: "Tu cuenta" });
    await trigger.click();
    await expect(page.getByRole("link", { name: "Cuenta y privacidad" })).toHaveAttribute("href", "#cuenta");
    await expect(page.locator("#cuenta")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Cuenta y privacidad" })).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL((url) => url.pathname === "/");
  });

  test("'QR para imprimir' offers SVG and a 1024 px PNG", async ({ page, request }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "QR para imprimir" }).click();
    const sheet = page.getByRole("dialog", { name: /Tu QR/ });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("img", { name: "Vista previa del QR para imprimir" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Descargar SVG" })).toHaveAttribute("href", "/u/demo/qr");
    await expect(sheet.getByRole("link", { name: "Descargar PNG (1024 px)" })).toHaveAttribute("href", "/u/demo/qr?format=png");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    const png = await request.get("/u/demo/qr?format=png");
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toBe("image/png");
    expect(png.headers()["content-disposition"]).toContain("passme-demo-qr.png");
  });
});

test.describe("welcome after creating a card", () => {
  test("from a shared link: «Mandarle mi tarjeta a Alex» first", async ({ page }) => {
    const welcome = await createCardFrom(page, "/u/demo", "/crear?de=demo");
    const send = welcome.getByRole("button", { name: "Mandarle mi tarjeta a Alex" });
    await expect(send).toBeVisible();
    await expect(welcome.getByText("Alex verá tu nombre y tu email.")).toBeVisible();
    await expect(welcome.getByText("¿Estáis juntos? Enséñale este QR")).toBeVisible();
    // Only one way to close it.
    await expect(welcome.getByRole("button", { name: /Cerrar/ })).toHaveCount(0);

    await send.click();
    await expect(welcome.getByRole("status")).toContainText("Alex ya tiene tu tarjeta.");
    await expect(send).toHaveCount(0);
  });

  test("after scanning in person: the QR first, a tap away from full screen", async ({ page, isMobile }) => {
    const welcome = await createCardFrom(page, "/u/demo?src=qr", "/crear?de=demo&via=qr");
    await expect(page).toHaveURL(/via=qr/);
    await expect(welcome.getByRole("button", { name: /Mandarle mi tarjeta/ })).toHaveCount(0);
    await expect(welcome.getByText(/Enséñale este QR a Alex/)).toBeVisible();
    await expect(welcome.getByText("Toca para ampliar")).toBeVisible();
    const qrLink = welcome.getByRole("link", { name: /QR de la tarjeta/ });
    await expect(qrLink).toHaveAttribute("href", "/dashboard/qr");
    if (isMobile) await expect(welcome.getByRole("link", { name: "Guardar mi QR en el móvil" })).toBeVisible();
  });

  test("on a phone, the QR and the wallet action fit without scrolling", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout");
    await page.setViewportSize(IPHONE_SIZE);
    await page.goto("/dashboard?nueva=1");
    const welcome = page.getByRole("region", { name: /Ya tienes tu tarjeta/ });
    await expect(welcome.getByRole("img", { name: /QR de la tarjeta/ })).toBeInViewport({ ratio: 1 });
    await expect(welcome.getByRole("link", { name: "Guardar mi QR en el móvil" })).toBeInViewport({ ratio: 1 });
  });
});

test.describe("Google Wallet off (GOOGLE_WALLET_LIVE unset)", () => {
  test("no screen links to the Google pass", async ({ page }) => {
    for (const path of ["/", "/dashboard", "/dashboard?nueva=1", "/dashboard?nueva=1&de=demo&via=share", "/dashboard/qr", "/wallet?t=x", "/u/demo"]) {
      await page.goto(path);
      await expect(page.locator('a[href*="/api/pass/google"]'), path).toHaveCount(0);
    }
  });

  test("Android sees it's coming instead of a dead button", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Android user agent");
    await page.goto("/dashboard");
    await expect(page.getByText("Google Wallet · muy pronto").first()).toBeVisible();
  });

  test("the landing doesn't promise it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Funciona en cualquier móvil con cámara")).toBeVisible();
    await expect(page.getByText("iPhone y Android")).toHaveCount(0);
    await expect(page.getByText(/Google Wallet/)).toHaveCount(0);
  });
});

test.describe("landing header", () => {
  for (const width of [320, 360, 375]) {
    test(`shows «Entrar» and «Crear» at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      await page.goto("/");
      const header = page.getByRole("banner");
      await expect(header.getByRole("link", { name: "Entrar", exact: true })).toBeVisible();
      await expect(header.getByRole("link", { name: "Crear", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
  }

  test("names the data section «Tus datos» on wide screens", async ({ page, isMobile }) => {
    test.skip(isMobile, "the anchors show from 768 px");
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Tus datos" })).toHaveAttribute("href", "#privacidad");
    await expect(header.getByRole("link", { name: "Crear mi tarjeta" })).toBeVisible();
  });
});

test.describe("app shell", () => {
  test("serves the manifest and the favicon", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    expect(await manifest.json()).toMatchObject({ start_url: "/dashboard/qr", display: "standalone" });
    for (const icon of ["/brand/icon-192.png", "/brand/icon-512.png", "/brand/icon-maskable-512.png"]) {
      expect((await request.get(icon)).status(), icon).toBe(200);
    }
    const favicon = await request.get("/favicon.ico");
    expect(favicon.status()).toBe(200);
    expect(favicon.headers()["content-type"]).toMatch(/icon/);
  });

  test("signing out only accepts POST, and only this device unless asked", async ({ request }) => {
    expect((await request.get("/auth/signout")).status()).toBe(405);
    const local = await request.post("/auth/signout", { maxRedirects: 0 });
    expect(local.status()).toBe(303);
    const global = await request.post("/auth/signout", { form: { scope: "global" }, maxRedirects: 0 });
    expect(global.status()).toBe(303);
  });
});

test("a visitor who owns the card is offered a way in", async ({ page }) => {
  await page.goto("/u/demo");
  await expect(page.getByText("¿Es tu tarjeta?")).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar", exact: true })).toHaveAttribute("href", "/login?next=/dashboard");
});
