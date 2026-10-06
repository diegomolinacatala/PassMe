import { expect, test } from "@playwright/test";

/** Fixes from the 2026-10-05 UX audit (docs/ux/AUDITORIA-UX-2026-10-05.md, block P1). Demo mode. */

test.describe("no horizontal scroll on narrow phones", () => {
  for (const width of [320, 360, 375, 393]) {
    for (const path of ["/dashboard", "/dashboard?nueva=1"]) {
      test(`${path} at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 740 });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBe(0);
      });
    }
  }
});

test("pass links followed without a session land on a page, not on JSON", async ({ page }) => {
  await page.goto("/api/pass/apple");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard|\/login\?next=\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Entra en tu tarjeta");
});

test("an expired 'send to my phone' QR offers a way forward", async ({ page }) => {
  await page.goto("/wallet?t=caducado");
  await expect(page.getByRole("heading", { name: "Este QR ya no vale" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar y añadir el pase" })).toHaveAttribute("href", "/login?next=/dashboard");
});

test("the generic 404 names itself in the tab", async ({ page }) => {
  await page.goto("/esta-pagina-no-existe");
  await expect(page).toHaveTitle("Página no encontrada · PassMe");
});

test("the landing confirms a deleted account", async ({ page }) => {
  await page.goto("/?cuenta=borrada");
  await expect(page.getByRole("status")).toHaveText("Tu cuenta y tu tarjeta se han borrado. Gracias por probar PassMe.");
});

test("'Guardar contacto' keeps the visit's source", async ({ page }) => {
  await page.goto("/u/demo?src=qr");
  await expect(page.getByRole("link", { name: "Guardar contacto" })).toHaveAttribute("href", "/u/demo/vcard?src=qr");
  const vcard = await page.request.get("/u/demo/vcard?src=qr");
  expect(vcard.headers()["content-disposition"]).toContain("filename*=UTF-8''Alex%20Rivera.vcf");
  expect((await vcard.text()).replace(/\r\n /g, "")).toContain("Guardado con PassMe el ");
});

test("Enter on /crear moves to the next field without validating", async ({ page }) => {
  await page.goto("/crear");
  await page.getByLabel("Nombre y apellidos").fill("Lucía Ferrer");
  await page.getByLabel("Nombre y apellidos").press("Enter");
  await expect(page.getByLabel("Cargo")).toBeFocused();
  await expect(page.locator("form [aria-invalid=true]")).toHaveCount(0);
  await expect(page.getByText("Tu nombre es obligatorio.")).toHaveCount(0);
});

test.describe("editor", () => {
  test("switches are named by their visible text", async ({ page }) => {
    await page.goto("/dashboard");
    for (const name of ["Tarjeta publicada", "Recibir propuestas de reunión", "Recibir contactos"]) {
      await expect(page.getByRole("switch", { name, exact: true })).toBeVisible();
    }
  });

  test("the received-contacts counter follows deletions", async ({ page }) => {
    await page.goto("/dashboard");
    const panel = page.locator("#contactos");
    await expect(panel.getByText("1 en total")).toBeVisible();
    await panel.getByRole("button", { name: /Borrar el contacto de Lucía Martín/ }).click();
    await panel.getByRole("button", { name: "Borrar", exact: true }).click();
    await expect(panel.getByText(/Aún no te ha dejado nadie/)).toBeVisible();
    await expect(panel.getByText("en total")).toHaveCount(0);
  });

  test("removing a contact detail keeps the focus in the list", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /^Quitar / }).first().click();
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? "BODY");
    expect(focused).not.toBe("BODY");
  });

  test("meeting rows don't repeat their group's title", async ({ page }) => {
    await page.goto("/dashboard");
    const panel = page.locator("#reuniones");
    await expect(panel.getByText("Te toca responder")).toBeVisible();
    await expect(panel.getByText("Te toca", { exact: true })).toHaveCount(0);
  });
});
