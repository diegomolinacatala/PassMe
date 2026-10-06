import { expect, test, type Page } from "@playwright/test";

/** Block P7 of the 2026-10-05 UX audit: the editor. Demo mode. */

async function openEditor(page: Page) {
  await page.goto("/dashboard");
  await expect(page.getByText("Modo demo:", { exact: false }).first()).toBeVisible();
}

test.describe("P7.6 discard changes", () => {
  test("one tap back to the saved card, and «Deshacer» brings the changes back", async ({ page }) => {
    await openEditor(page);
    const role = page.getByLabel("Cargo");
    await role.fill("Head of Design");
    await page.getByRole("button", { name: "Descartar" }).click();
    await expect(role).toHaveValue("Product Designer");
    await expect(page.getByRole("status").filter({ hasText: "Cambios descartados" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Deshacer" })).toBeFocused();

    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(role).toHaveValue("Head of Design");
    await expect(page.getByRole("status").filter({ hasText: "Cambios sin guardar" })).toBeVisible();
  });
});

test.describe("P7.8 card link", () => {
  test("converts as you type and offers two free alternatives when taken", async ({ page }) => {
    await openEditor(page);
    const slug = page.getByLabel("Enlace de tu tarjeta");
    await slug.fill("Pablo_Serrano");
    await expect(slug).toHaveValue("pablo-serrano");
    await expect(page.getByText("Ese ya está cogido. ¿Te vale pablo-serrano-2 o pabloserrano?")).toBeVisible();
    await page.getByRole("button", { name: "Usar pabloserrano" }).click();
    await expect(slug).toHaveValue("pabloserrano");
    await expect(page.getByText("¡Disponible!")).toBeVisible();
  });
});

test.describe("P7.9 who you are", () => {
  test("warns when the name won't fit in the pass", async ({ page }) => {
    await openEditor(page);
    const warning = page.getByText("En el pase se verá cortado: prueba con nombre y primer apellido.");
    await expect(warning).toHaveCount(0);
    await page.getByLabel("Nombre y apellidos").fill("Pablo Serrano Iglesias de la Fuente");
    await expect(warning).toBeVisible();
  });

  test("location and pronouns stay open while the card uses them", async ({ page }) => {
    await openEditor(page);
    // The demo card has a location: the fields are there, and clearing it doesn't hide them.
    await page.getByLabel("Ubicación").fill("");
    await expect(page.getByLabel("Pronombres")).toBeVisible();
    await expect(page.getByRole("button", { name: /Añadir más datos/ })).toHaveCount(0);
  });
});

test.describe("P7.7 style", () => {
  test("the advanced options are folded and a hex color can be pasted", async ({ page, isMobile }) => {
    await openEditor(page);
    const style = page.getByRole("region", { name: "Estilo" });
    await expect(style.getByRole("button", { name: "Otra variación" })).toBeHidden();
    if (isMobile) {
      const box = await style.boundingBox();
      expect(box!.height).toBeLessThanOrEqual(1000);
    }
    const more = style.getByRole("button", { name: "Más opciones de estilo" });
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await style.getByLabel("Fondo: código de color").fill("#1F3A5F");
    const pass = page.getByLabel(/Vista previa del pase de Apple Wallet/).locator("visible=true");
    await expect(pass).toHaveCSS("background-color", "rgb(31, 58, 95)");
    await expect(style.getByLabel("Color de los trazos: código de color")).toBeVisible();
    // Letter-only motifs say so.
    await style.getByRole("radio", { name: "Monograma" }).click();
    await expect(style.getByText("Este motivo no tiene variaciones.")).toBeVisible();
  });
});

test.describe("P7.2 what people can do when they scan", () => {
  test("the preview shows or hides each action with its switch", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("tab", { name: "Al escanear" }).locator("visible=true").click();
    const panel = page.locator("[role=tabpanel]:visible");
    await expect(panel.getByText("Déjale tu contacto a Alex")).toBeVisible();
    await expect(panel.getByText("Agendar reunión con Alex")).toBeVisible();
    await page.getByRole("switch", { name: "Recibir contactos" }).click();
    await expect(panel.getByText("Déjale tu contacto a Alex")).toHaveCount(0);
    await page.getByRole("switch", { name: "Recibir propuestas de reunión" }).click();
    await expect(panel.getByText("Agendar reunión con Alex")).toHaveCount(0);
    await page.getByRole("switch", { name: "Recibir contactos" }).click();
    await expect(panel.getByText("Déjale tu contacto a Alex")).toBeVisible();
  });
});

test.describe("P7.1 one page with an index", () => {
  test("a meeting to answer and the account are two taps away", async ({ page }) => {
    await openEditor(page);
    await page.getByLabel("Sobre ti").focus();
    const index = page.getByRole("button", { name: /Secciones del editor/ });
    const nav = page.getByRole("navigation", { name: "Secciones del editor" });
    await index.click();
    await nav.getByRole("link", { name: /Reuniones/ }).click();
    await expect(page.locator("#reuniones").getByText("Te toca responder")).toBeInViewport();
    await expect(nav).toBeHidden();

    await index.click();
    await nav.getByRole("link", { name: /Cuenta/ }).click();
    await expect(page.getByRole("region", { name: "Cuenta" })).toBeInViewport();
  });

  test("Escape closes the index and gives the focus back", async ({ page }) => {
    await openEditor(page);
    const index = page.getByRole("button", { name: /Secciones del editor/ });
    await index.click();
    await expect(index).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(index).toHaveAttribute("aria-expanded", "false");
    await expect(index).toBeFocused();
  });

  test("on phones the inbox goes above «Estilo»", async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await openEditor(page);
    const top = async (name: string) => (await page.getByRole("region", { name, exact: true }).boundingBox())!.y;
    expect(await top("Reuniones")).toBeLessThan(await top("Estilo"));
    expect(await top("Contactos recibidos")).toBeLessThan(await top("Estilo"));
    expect(await top("Cómo contactarte")).toBeLessThan(await top("Reuniones"));
  });

  test("at 1440×900 the preview stays in view while editing", async ({ page, isMobile }) => {
    test.skip(isMobile);
    await openEditor(page);
    const pass = page.getByLabel(/Vista previa del pase de Apple Wallet/).locator("visible=true");
    for (const label of ["Sobre ti", "Enlace de tu tarjeta"]) {
      await page.getByLabel(label).focus();
      await page.getByLabel(label).scrollIntoViewIfNeeded();
      await expect(pass).toBeInViewport({ ratio: 0.5 });
    }
  });
});

test.describe("P7.3 contact details", () => {
  test("pasting a link creates a Web in two taps", async ({ page }) => {
    await openEditor(page);
    const webs = page.getByLabel("Web: valor");
    await expect(webs).toHaveCount(1);
    const field = page.getByLabel("Pega un enlace, email o teléfono");
    await field.fill("https://www.behance.net/pablo");
    await expect(page.getByText("Se añadirá como Web.")).toBeVisible();
    await page.getByRole("button", { name: "Añadir", exact: true }).click();
    await expect(webs).toHaveCount(2);
    await expect(webs.last()).toHaveValue("https://www.behance.net/pablo");
    await expect(field).toHaveValue("");
  });

  test("the list of kinds has a single «Web» and no «Otra web»", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: "Elegir tipo…" }).click();
    const kinds = page.getByRole("list", { name: "Tipos de dato" }).getByRole("button");
    await expect(kinds).toHaveCount(12);
    await expect(kinds.filter({ hasText: "Otra web" })).toHaveCount(0);
    await expect(kinds.filter({ hasText: /^Enlace$/ })).toHaveCount(0);
  });

  test("rows are compact and every control is at least 44 px", async ({ page, isMobile }) => {
    await openEditor(page);
    const region = page.getByRole("region", { name: "Cómo contactarte" });
    const emailRow = page.locator("li", { has: page.getByLabel("Email: valor") });
    if (isMobile) expect((await emailRow.boundingBox())!.height).toBeLessThanOrEqual(72);
    for (const button of await region.getByRole("button").all()) {
      if (!(await button.isVisible())) continue;
      const box = (await button.boundingBox())!;
      expect(box.height, await button.innerText()).toBeGreaterThanOrEqual(44);
      expect(box.width, await button.innerText()).toBeGreaterThanOrEqual(44);
    }
  });

  test("the last detail goes to the top in two taps, and the menu does the rest", async ({ page }) => {
    await openEditor(page);
    const values = page.getByLabel(/: valor$/);
    await page.getByRole("button", { name: "Opciones de Instagram" }).click();
    await page.getByRole("menuitem", { name: "Subir al principio" }).click();
    await expect(values.first()).toHaveAttribute("aria-label", "Instagram: valor");
    await expect(page.getByRole("button", { name: "Opciones de Instagram" })).toBeFocused();

    await page.getByRole("button", { name: "Opciones de Instagram" }).click();
    await page.getByRole("menuitem", { name: "Duplicar" }).click();
    await expect(page.getByLabel("Instagram: valor")).toHaveCount(2);

    await page.getByRole("button", { name: "Opciones de Instagram" }).first().click();
    await page.getByRole("menuitem", { name: "Cambiar tipo…" }).click();
    await page.getByRole("menuitemradio", { name: "X" }).click();
    await expect(page.getByLabel("X: valor")).toHaveCount(1);
  });

  test("the handle moves a detail with the arrow keys and says where it went", async ({ page }) => {
    await openEditor(page);
    const values = page.getByLabel(/: valor$/);
    const handle = page.getByRole("button", { name: "Mover LinkedIn" });
    await handle.focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(values.first()).toHaveAttribute("aria-label", "LinkedIn: valor");
    await expect(handle).toBeFocused();
    await expect(page.getByText("LinkedIn en la posición 1 de 6.")).toBeAttached();
  });

  test("dragging the handle reorders", async ({ page, isMobile }) => {
    test.skip(isMobile, "Mouse drag; touch uses a long press");
    await openEditor(page);
    const values = page.getByLabel(/: valor$/);
    await page.evaluate(() => {
      const first = document.querySelector("[data-row-id]")!;
      window.scrollBy(0, first.getBoundingClientRect().top - 300);
    });
    const from = (await page.getByRole("button", { name: "Mover Instagram" }).boundingBox())!;
    const to = (await page.getByRole("button", { name: "Mover Email" }).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y - 4, { steps: 12 });
    await page.mouse.up();
    await expect(values.first()).toHaveAttribute("aria-label", "Instagram: valor");
  });
});

test.describe("P7.4 preview at hand on phones", () => {
  test("from any field, the updated pass is one tap away", async ({ page, isMobile }) => {
    await openEditor(page);
    const pill = page.getByRole("button", { name: "Ver el pase" });
    if (!isMobile) {
      await page.getByLabel("Sobre ti").focus();
      await expect(pill).toBeHidden();
      return;
    }
    await expect(pill).toBeHidden();
    await page.getByLabel("Cargo").fill("Head of Design");
    await page.getByLabel("Sobre ti").focus();
    await page.getByLabel("Sobre ti").scrollIntoViewIfNeeded();
    await expect(pill).toBeVisible();
    const scrolled = await page.evaluate(() => window.scrollY);

    await pill.click();
    const sheet = page.getByRole("dialog", { name: "Vista previa" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("tab")).toHaveCount(3);
    await sheet.getByRole("tab", { name: "Al escanear" }).click();
    await expect(sheet.getByText("Head of Design · Estudio Norte")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(pill).toBeFocused();
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrolled)).toBeLessThan(4);
  });

  test("the pill sits above the save bar and doesn't hide the focused field", async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await openEditor(page);
    await page.getByLabel("Sobre ti").fill("Hola");
    const pill = page.getByRole("button", { name: "Ver el pase" });
    await expect(pill).toBeVisible();
    const save = (await page.getByRole("button", { name: "Guardar", exact: true }).boundingBox())!;
    const pillBox = (await pill.boundingBox())!;
    expect(pillBox.y + pillBox.height).toBeLessThanOrEqual(save.y);
    const field = (await page.getByLabel("Sobre ti").boundingBox())!;
    expect(field.y + field.height).toBeLessThanOrEqual(pillBox.y);
  });
});

test.describe("P7.5 photo framing", () => {
  async function pngFile(page: Page) {
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 40;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#3E2C23";
      ctx.fillRect(0, 0, 80, 40);
      ctx.fillStyle = "#EF7A4A";
      ctx.fillRect(50, 10, 20, 20);
      return canvas.toDataURL("image/png");
    });
    return { name: "foto.png", mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1]!, "base64") };
  }

  test("the photo is framed before it's used", async ({ page }) => {
    await openEditor(page);
    await expect(page.getByText("Podrás encuadrarla. Sale en el pase y al guardar tu contacto.")).toBeVisible();
    await page.locator("input[type=file]").setInputFiles(await pngFile(page));
    const sheet = page.getByRole("dialog", { name: /Encuadra/ });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("group", { name: "Encuadre de la foto" }).focus();
    await page.keyboard.press("ArrowLeft");
    await sheet.getByRole("slider", { name: "Zoom" }).fill("2");
    await sheet.getByRole("button", { name: "Usar foto" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("img", { name: "Foto de Alex Rivera" }).first()).toBeVisible();
  });

  test("«Cancelar» leaves the photo as it was", async ({ page }) => {
    await openEditor(page);
    await page.locator("input[type=file]").setInputFiles(await pngFile(page));
    const sheet = page.getByRole("dialog", { name: /Encuadra/ });
    await sheet.getByRole("button", { name: "Cancelar" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("img", { name: "Foto de Alex Rivera" })).toHaveCount(0);
  });

  test("a HEIC the browser can't open gets its own message", async ({ page }) => {
    await openEditor(page);
    await page.locator("input[type=file]").setInputFiles({ name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: Buffer.from("not really a photo") });
    await expect(page.getByText("Tu navegador no abre fotos HEIC. Expórtala como JPG o hazle una captura.")).toBeVisible();
  });
});
