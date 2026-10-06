import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Block P3 of the 2026-10-05 UX audit: shared components and visual rules. Demo mode. */

const MAIN_ROUTES = ["/", "/u/demo", "/crear", "/login", "/dashboard"];

test.describe("button rule", () => {
  for (const path of [...MAIN_ROUTES, "/dashboard?nueva=1", "/reunion/demo/anfitrion", "/reunion/demo/invitado"]) {
    test(`at most one signal button on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const visible = await page.locator(".btn-signal").evaluateAll(
        (els) => els.filter((el) => (el as HTMLElement).offsetParent !== null && el.getClientRects().length > 0).length,
      );
      expect(visible).toBeLessThanOrEqual(1);
    });
  }

  test("primary submits are signal: «Enviarme un código» and «Dejarle mi contacto»", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Enviarme un código" })).toHaveClass(/btn-signal/);
    await page.goto("/u/demo");
    await page.getByRole("button", { name: /Déjale tu contacto/ }).click();
    await expect(page.getByRole("button", { name: "Dejarle mi contacto" })).toHaveClass(/btn-signal/);
  });
});

test.describe("fields", () => {
  test("labels are plain text, only optional fields are marked, no name placeholders", async ({ page }) => {
    await page.goto("/crear");
    const name = page.getByLabel("Nombre y apellidos");
    await expect(name).not.toHaveAttribute("placeholder");
    await expect(page.getByText("*", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Opcional", { exact: true })).toHaveCount(2);
    // A visible outline on focus, not a 6 % shadow.
    await name.focus();
    const outline = await name.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe("solid");
  });
});

test.describe("deleting and removing", () => {
  test("a received contact asks inline: «No borrar» keeps it, «Borrar» deletes it", async ({ page }) => {
    let dialogs = 0;
    page.on("dialog", (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });
    await page.goto("/dashboard");
    const panel = page.locator("#contactos");
    const trash = panel.getByRole("button", { name: /Borrar el contacto de Lucía Martín/ });
    await trash.click();
    await expect(panel.getByRole("button", { name: "No borrar" })).toBeFocused();
    await panel.getByRole("button", { name: "No borrar" }).click();
    await expect(trash).toBeFocused();
    await expect(panel.getByText("1 en total")).toBeVisible();

    await trash.click();
    await panel.getByRole("button", { name: "Borrar", exact: true }).click();
    await expect(panel.getByText(/Aún no te ha dejado nadie/)).toBeVisible();
    expect(dialogs).toBe(0);
  });

  test("a contact detail is removed without asking and comes back in place with «Deshacer»", async ({ page }) => {
    await page.goto("/dashboard");
    const values = page.getByLabel(/: valor$/);
    const first = await values.first().getAttribute("aria-label");
    const count = await values.count();
    await page.getByRole("button", { name: /^Quitar / }).first().click();
    await expect(values).toHaveCount(count - 1);
    const status = page.getByRole("status").filter({ hasText: "Email quitado" });
    await expect(status).toBeVisible();
    await status.getByRole("button", { name: "Deshacer" }).click();
    await expect(values).toHaveCount(count);
    await expect(values.first()).toHaveAttribute("aria-label", first!);
    await expect(values.first()).toBeFocused();
  });

  test("a meeting leaves the list with «Deshacer» instead of a dialog", async ({ page }) => {
    let dialogs = 0;
    page.on("dialog", (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });
    await page.goto("/dashboard");
    const panel = page.locator("#reuniones");
    // An unanswered proposal: the bin offers "say no" or "remove without telling" (P6.11).
    const remove = panel.getByRole("button", { name: /^Rechazar o quitar la propuesta de / }).first();
    const label = (await remove.getAttribute("aria-label"))!;
    await remove.click();
    await panel.getByRole("button", { name: "Quitar sin avisar (es spam)" }).click();
    await expect(panel.getByRole("button", { name: label })).toHaveCount(0);
    await panel.getByRole("button", { name: "Deshacer" }).click();
    await expect(panel.getByRole("button", { name: label })).toHaveCount(1);
    expect(dialogs).toBe(0);
  });
});

test.describe("option groups", () => {
  test("/crear: the submit («Continuar» while there's no email) in ≤ 11 Tabs, and the arrow keys change the color", async ({ page, isMobile }) => {
    test.skip(isMobile, "Keyboard navigation");
    await page.goto("/crear");
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    let presses = 0;
    for (; presses < 30; presses++) {
      await page.keyboard.press("Tab");
      const isSubmit = await page.evaluate(() => ["Crear mi tarjeta", "Continuar"].includes(document.activeElement?.textContent?.trim() ?? ""));
      if (isSubmit) break;
    }
    expect(presses + 1).toBeLessThanOrEqual(11);

    const checked = page.getByRole("radio", { checked: true });
    const before = await checked.getAttribute("aria-label");
    await checked.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { checked: true })).not.toHaveAttribute("aria-label", before!);
    await expect(page.getByRole("radio", { checked: true })).toBeFocused();
  });

  test("preview tabs: one Tab stop, the arrows move and select", async ({ page, isMobile }) => {
    test.skip(isMobile, "Keyboard navigation");
    await page.goto("/dashboard");
    const apple = page.getByRole("tab", { name: "Apple Wallet" }).locator("visible=true");
    await expect(apple).toHaveAttribute("tabindex", "0");
    await expect(page.getByRole("tab", { name: "Google Wallet" }).locator("visible=true")).toHaveAttribute("tabindex", "-1");
    await apple.focus();
    await page.keyboard.press("ArrowRight");
    const google = page.getByRole("tab", { name: "Google Wallet" }).locator("visible=true");
    await expect(google).toBeFocused();
    await expect(google).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Al escanear" }).locator("visible=true")).toHaveAttribute("aria-selected", "true");
  });

  test("the meeting format is a native radio group", async ({ page }) => {
    await page.goto("/u/demo");
    await page.getByRole("button", { name: /Agendar reunión con/ }).click();
    await page.getByRole("radio", { name: "Videollamada" }).click();
    await expect(page.getByRole("radio", { name: "Videollamada" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "En persona" })).not.toBeChecked();
  });
});

test.describe("scale", () => {
  test("with the text at 200 %, no main route scrolls sideways at 390 px", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Phone layout");
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of MAIN_ROUTES) {
      await page.goto(path);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await page.waitForTimeout(100);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("regions and headings", () => {
  const RULES = ["landmark-one-main", "region", "heading-order"];

  test("/dashboard?nueva=1 has one main, everything in a region, headings in order", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard?nueva=1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const results = await new AxeBuilder({ page }).withRules(RULES).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

  test("the meeting form is a region with a visible H2 and H3 steps", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/u/demo");
    await page.getByRole("button", { name: /Agendar reunión con/ }).click();
    await expect(page.getByRole("region", { name: /Agendar reunión con/ }).getByRole("heading", { level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: /¿Cuándo os veis\?/ })).toBeVisible();
    const results = await new AxeBuilder({ page }).withRules(RULES).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
