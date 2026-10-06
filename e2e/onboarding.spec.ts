import { expect, test, type Page } from "@playwright/test";

/**
 * Two people, one QR: whoever scans a card can create their own in a minute
 * and show their QR back. Demo mode: no email is sent and the code is 00000000.
 */

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("a scanned card invites the visitor to create their own", async ({ page }) => {
  await page.goto("/u/demo?src=qr");
  // How they got here travels along: the welcome is different for a scan and for a shared link.
  await expect(page.getByRole("link", { name: "Crear la mía" })).toHaveAttribute("href", "/crear?de=demo&via=qr");
  const cta = page.getByRole("region", { name: /Ten tu tarjeta así/ });
  await expect(cta.getByRole("link", { name: "Crear mi tarjeta" })).toHaveAttribute("href", "/crear?de=demo&via=qr");
});

test("create a card: form, code, welcome with the QR to show", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/crear?de=demo");
  await expect(page.getByText("Vienes de la tarjeta de")).toContainText("Alex Rivera");

  // Nothing filled in (no email yet, so it only continues): both requirements are explained.
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Tu nombre es obligatorio.")).toBeVisible();
  await expect(page.getByText(/Añade al menos un teléfono, un email o tu LinkedIn/)).toBeVisible();
  await expect(page.getByLabel("Nombre y apellidos")).toBeFocused();

  // The pass takes shape while typing.
  await page.getByLabel("Nombre y apellidos").fill("Lucía Ferrer");
  await page.getByLabel("Email").fill("lucia@example.com");
  await page.getByRole("radio", { name: "Café" }).click();
  await expect(page.getByLabel(/Vista previa del pase de .* Wallet de Lucía Ferrer/)).toBeVisible();
  await expect(page.getByText("Te mandaremos un código a lucia@example.com para guardarla.")).toBeVisible();

  // One tap from the form to the 8 boxes: no screen asking for the email again.
  await page.getByRole("button", { name: "Crear mi tarjeta" }).click();
  await expect(page.getByRole("heading", { name: /Escribe el código/ })).toBeVisible();
  await expect(page.getByText("Último paso")).toBeVisible();
  await expect(page.getByText("¡Código enviado!")).toBeVisible();
  await expect(page.getByText("lucia@example.com", { exact: true }).locator("visible=true")).toBeVisible();
  // Resending waits for the cooldown instead of letting people hammer the button.
  await expect(page.getByRole("button", { name: /Reenviar en \d:\d\d/ })).toBeDisabled();

  const code = page.getByLabel("Código de 8 cifras");
  await expect(code).toBeFocused();
  await code.fill("11111111");
  await expect(page.getByText("Código incorrecto o caducado.")).toBeVisible();
  await expect(code).toHaveValue("");

  // Pasted with a space, as it often comes from the email: submits by itself.
  await code.fill("0000 0000");
  await page.waitForURL(/\/dashboard\?nueva=1&de=demo/);
  const welcome = page.getByRole("region", { name: /Ya tienes tu tarjeta/ });
  await expect(welcome.getByRole("img", { name: /QR de la tarjeta/ })).toBeVisible();
  await expect(welcome.getByRole("button", { name: /^(Compartir|Copiar enlace)$/ })).toBeVisible();

  // One way out, which says where it leads.
  await welcome.getByRole("button", { name: "Personalizar mi tarjeta" }).click();
  await expect(welcome).toHaveCount(0);
  // Focus lands in the editor, not on <body>.
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(errors).toEqual([]);
});

test("details left with 'Déjale tu contacto' prefill the new card", async ({ page }) => {
  await page.goto("/u/demo?src=qr");
  await page.getByRole("button", { name: /Déjale tu contacto a Alex/ }).click();
  await page.getByLabel("Nombre").fill("Lucía Martín");
  await page.getByLabel("Teléfono").fill("+34 611 22 33 44");
  await page.getByLabel("Empresa").fill("Hotel Mirador");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Dejarle mi contacto" }).click();
  await expect(page.getByRole("status")).toContainText("Alex ya tiene tu contacto.");

  // Any "create mine" button works, not only the one in the confirmation.
  await page.getByRole("link", { name: "Crear la mía", exact: true }).click();
  await page.waitForURL(/\/crear\?de=demo/);
  await expect(page.getByLabel("Nombre y apellidos")).toHaveValue("Lucía Martín");
  await expect(page.getByLabel("Empresa")).toHaveValue("Hotel Mirador");
  await expect(page.getByLabel("Móvil")).toHaveValue("+34 611 22 33 44");
});

test("the email's button asks for a tap instead of signing in on open", async ({ page }) => {
  await page.goto(`/auth/confirm?token_hash=${"a".repeat(56)}&type=email&next=/dashboard`);
  await expect(page).toHaveURL(/\/auth\/entrar\?/);
  await expect(page.getByRole("button", { name: "Entrar en PassMe" })).toBeVisible();

  await page.goto("/auth/confirm?token_hash=x&type=nope");
  await expect(page).toHaveURL(/\/login\?error=link/);
  await expect(page.getByText("El enlace ha caducado o ya se usó. Pide uno nuevo.")).toBeVisible();
});

test("login: the code screen shows up, can change the email and signs in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Entra en tu tarjeta");
  await expect(page.getByRole("link", { name: "Crear mi tarjeta" })).toHaveAttribute("href", "/crear");
  // D3 (b): signing in may still create an account, but the page doesn't push that path.
  await expect(page.getByText(/Si es tu primera vez/)).toHaveCount(0);

  await page.getByLabel("Tu email").fill("alex@example.com");
  const send = page.getByRole("button", { name: "Enviarme un código" });
  await send.click();
  await expect(page.getByText("¡Código enviado!")).toBeVisible();

  await page.getByRole("button", { name: "Cambiar email" }).click();
  await expect(page.getByLabel("Tu email")).toHaveValue("alex@example.com");
  await page.getByLabel("Tu email").fill("otro@example.com");
  await send.click();
  await expect(page.getByText("otro@example.com", { exact: true })).toBeVisible();

  // An incomplete code can't be sent (and can't use up an attempt).
  await page.getByLabel("Código de 8 cifras").fill("0000000");
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeDisabled();
  await page.getByLabel("Código de 8 cifras").fill("00000000");
  await page.waitForURL(/\/dashboard$/);
});
