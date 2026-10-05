import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** "Agendar reunión" in demo mode: validated end to end, nothing stored or sent. */

async function seriousViolations(page: Page, selector: string) {
  const results = await new AxeBuilder({ page }).include(selector).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
}

test.describe("meeting proposals", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("a visitor proposes two times in two short steps", async ({ page }) => {
    await page.goto("/u/demo?src=qr");
    await page.getByRole("button", { name: /Agendar reunión con Alex/ }).click();
    await expect(page.getByRole("heading", { name: "¿Cuándo os veis?" })).toBeFocused();

    // Without a time there's no next step: the button says so and brings the days into view.
    await page.getByRole("button", { name: "Elige al menos una hora" }).click();
    await expect(page.getByText("Elige al menos una hora.")).toBeInViewport();
    await expect(page.getByRole("group", { name: "Día" })).toBeInViewport();

    // The day after tomorrow always has every time available.
    await page.getByRole("group", { name: "Día" }).getByRole("button").nth(2).click();
    await page.getByRole("button", { name: /^10:00,/ }).click();
    await page.getByRole("button", { name: /^12:30,/ }).click();
    await expect(page.getByRole("button", { name: /^10:00,/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("2/3")).toBeVisible();
    await page.getByRole("radio", { name: "1 h" }).click();
    await page.getByRole("radio", { name: "Videollamada" }).click();
    expect(await seriousViolations(page, "form")).toEqual([]);
    await page.getByRole("button", { name: "Continuar con 2 horas" }).click();

    await expect(page.getByRole("heading", { name: "¿Quién propone?" })).toBeFocused();
    await expect(page.getByText("1 h · Videollamada")).toBeVisible();
    await page.getByRole("button", { name: "Enviar propuesta" }).click();
    await expect(page.getByText("Dinos cómo te llamas.")).toBeVisible();
    await expect(page.getByText("Necesitamos tu email para enviarte la invitación.")).toBeVisible();
    await expect(page.getByText("Marca la casilla para poder enviar la propuesta.")).toBeVisible();

    await page.getByLabel("Nombre").fill("Lucía Martín");
    await page.getByLabel("Email").fill("lucia@example.com");
    await page.getByRole("checkbox").check();
    expect(await seriousViolations(page, "form")).toEqual([]);
    await page.getByRole("button", { name: "Enviar propuesta" }).click();

    const sent = page.getByRole("status");
    await expect(sent).toContainText("Propuesta enviada a Alex.");
    await expect(sent).toContainText("10:00");
    await expect(sent).toContainText("12:30");
    await expect(sent).toContainText("tarjeta de ejemplo");
    await expect(page.getByRole("link", { name: /Crear la mía con estos datos/ })).toBeVisible();
  });

  test("calls need a phone number", async ({ page }) => {
    await page.goto("/u/demo");
    await page.getByRole("button", { name: /Agendar reunión con Alex/ }).click();
    await page.getByRole("group", { name: "Día" }).getByRole("button").nth(2).click();
    await page.getByRole("button", { name: /^11:00,/ }).click();
    await page.getByRole("radio", { name: "Llamada", exact: true }).click();
    await page.getByRole("button", { name: "Continuar con 1 hora" }).click();
    await page.getByLabel("Nombre").fill("Lucía Martín");
    await page.getByLabel("Email").fill("lucia@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Enviar propuesta" }).click();
    await expect(page.getByText("Para una llamada, deja tu teléfono.")).toBeVisible();
    // After the server's answer nothing looks reset: the checkbox is still ticked and focus is on the field to fix.
    await expect(page.getByRole("checkbox")).toBeChecked();
    await expect(page.getByLabel("Teléfono")).toBeFocused();
  });
});

test.describe("answering a meeting", () => {
  test("the owner confirms the time chosen in the email", async ({ page }) => {
    await page.goto("/reunion/demo/anfitrion?hora=1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lucía quiere reunirse contigo");
    const radios = page.getByRole("radio");
    await expect(radios).toHaveCount(2);
    await expect(radios.nth(1)).toBeChecked();
    await expect(page.getByLabel("Lugar")).toHaveValue("Café Central, Valencia");
    await page.getByRole("button", { name: /^Confirmar 12:30$/ }).click();

    await expect(page.getByRole("status")).toContainText("Confirmada.");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reunión confirmada");
    await expect(page.getByRole("link", { name: "Google Calendar" })).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\//);

    const ics = await page.request.get("/reunion/demo/anfitrion/invitacion.ics");
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    expect(await ics.text()).toContain("BEGIN:VEVENT");
  });

  test("the owner proposes other times", async ({ page }) => {
    await page.goto("/reunion/demo/anfitrion?accion=otra");
    await expect(page.getByRole("heading", { name: "Proponer otras horas" })).toBeFocused();
    await page.getByRole("group", { name: "Día" }).getByRole("button").nth(3).click();
    await page.getByRole("button", { name: /^16:00,/ }).click();
    await page.getByLabel(/Un mensaje para Lucía/).fill("Esa mañana no puedo.");
    await page.getByRole("button", { name: "Enviar hora" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Esperando a Lucía");
    await expect(page.getByText("Esa mañana no puedo.")).toBeVisible();
  });

  test("the owner declines with a note", async ({ page }) => {
    await page.goto("/reunion/demo/anfitrion");
    await page.getByRole("button", { name: "No puedo" }).click();
    await page.getByLabel("Nota").fill("Estas semanas voy liado.");
    await page.getByRole("button", { name: "Enviar respuesta" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Has dicho que no esta vez");
  });

  test("the visitor waits and can cancel the proposal", async ({ page }) => {
    await page.goto("/reunion/demo/invitado");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Esperando a Alex");
    await expect(page.getByText("desde aquí puedes ver o cancelar tu propuesta")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar propuesta" }).click();
    await expect(page.getByLabel("Nota")).toBeFocused();
    await page.getByRole("button", { name: "No, mantener" }).click();
    await expect(page.getByRole("button", { name: "Cancelar propuesta" })).toBeFocused();
    await page.getByRole("button", { name: "Cancelar propuesta" }).click();
    await page.getByRole("button", { name: "Sí, cancelar propuesta" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Propuesta cancelada");
    await expect(page.getByRole("link", { name: "Proponer otras horas" })).toHaveAttribute("href", "/u/demo");
  });

  test("demo: a confirmed meeting can then be cancelled", async ({ page }) => {
    await page.goto("/reunion/demo/anfitrion?hora=0");
    await page.getByRole("button", { name: /^Confirmar / }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reunión confirmada");
    await page.getByRole("button", { name: "Cancelar reunión" }).click();
    await page.getByRole("button", { name: "Sí, cancelar reunión" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reunión cancelada");
  });

  test("going back from a panel returns focus to its button", async ({ page }) => {
    await page.goto("/reunion/demo/anfitrion");
    await page.getByRole("button", { name: "No puedo" }).click();
    await expect(page.getByRole("heading", { name: "¿No puedes en ninguna?" })).toBeFocused();
    await page.getByRole("button", { name: "Volver" }).click();
    await expect(page.getByRole("button", { name: "No puedo" })).toBeFocused();
  });

  for (const [path, title] of [
    ["/reunion/demo-confirmada/anfitrion", "Reunión confirmada"],
    ["/reunion/demo-confirmada/invitado", "Reunión confirmada"],
    ["/reunion/demo-contra/invitado", "Alex te propone otra hora"],
    ["/reunion/demo-caducada/invitado", "Las horas propuestas ya pasaron"],
    ["/reunion/demo-pasada/anfitrion", "Esta reunión ya pasó"],
  ] as const) {
    test(`demo sample ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    });
  }

  test("a tampered link is refused", async ({ page }) => {
    await page.goto("/reunion/11111111-2222-4333-8444-555555555555/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await expect(page.getByRole("heading", { name: "Enlace no válido" })).toBeVisible();
  });
});

test("the owner sees proposals and the switch in the editor", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Reuniones" })).toBeVisible();
  await expect(page.getByText("Te toca responder")).toBeVisible();
  await expect(page.getByRole("link", { name: /Responder: reunión con Lucía Martín/ })).toHaveAttribute("href", "/reunion/demo/anfitrion");
  await expect(page.getByRole("switch", { name: "Recibir propuestas de reunión" })).toHaveAttribute("aria-checked", "true");
});

test("the privacy policy explains meeting proposals", async ({ page }) => {
  await page.goto("/privacidad#reuniones");
  await expect(page.getByRole("heading", { name: "Si propones una reunión" })).toBeVisible();
});
