import { expect, test, type Page } from "@playwright/test";

/** Fails the test on any console error or CSP violation. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test.describe("landing", () => {
  test("renders the hero and links to the demo card", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("en la cartera");
    await expect(page.getByRole("link", { name: /Ver un ejemplo/ })).toHaveAttribute("href", "/u/demo");
    await expect(page.locator("#privacidad")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("sends security headers and a nonce-based CSP", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});

test("key pages never scroll horizontally", async ({ page }) => {
  for (const path of ["/", "/u/demo", "/dashboard", "/login", "/privacidad", "/terminos"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test.describe("public card", () => {
  test("shows the demo card with only visible links", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/u/demo");
    await expect(page.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
    await expect(page.getByRole("link", { name: /alex@example\.com/ })).toHaveAttribute("href", "mailto:alex@example.com");
    await expect(page.getByRole("link", { name: /in\/alex-rivera-demo/ })).toHaveAttribute("target", "_blank");
    // The hidden phone number must not even be in the HTML.
    expect(await page.content()).not.toContain("600 000 000");
    expect(errors).toEqual([]);
  });

  test("offers a vCard with the visible contacts", async ({ request }) => {
    const response = await request.get("/u/demo/vcard");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/vcard");
    const body = await response.text();
    expect(body).toContain("FN:Alex Rivera");
    expect(body).toContain("EMAIL;TYPE=INTERNET:alex@example.com");
    expect(body).not.toContain("600");
  });

  test("opens the vCard inline on iPhone and downloads it elsewhere", async ({ request }) => {
    const iphone = await request.get("/u/demo/vcard", {
      headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" },
    });
    expect(iphone.headers()["content-disposition"]).toMatch(/^inline/);
    const android = await request.get("/u/demo/vcard", {
      headers: { "user-agent": "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140 Mobile Safari/537.36" },
    });
    expect(android.headers()["content-disposition"]).toMatch(/^attachment/);
  });

  test("serves a printable SVG QR", async ({ request }) => {
    const response = await request.get("/u/demo/qr");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    expect(await response.text()).toContain("<svg");
  });

  test("serves the Google Wallet hero artwork", async ({ request }) => {
    const response = await request.get("/u/demo/hero");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect((await request.get("/u/esta-tarjeta-no-existe/hero")).status()).toBe(404);
  });

  test("returns 404 for unknown cards", async ({ page }) => {
    const response = await page.goto("/u/esta-tarjeta-no-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Esta tarjeta no existe" })).toBeVisible();
  });

  test("has link-preview metadata", async ({ page }) => {
    await page.goto("/u/demo");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/u\/demo\/opengraph-image/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("api", () => {
  test("health reports configuration booleans", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json).toHaveProperty("appleWallet");
    expect(JSON.stringify(json)).not.toMatch(/sb_secret|BEGIN/);
  });

  test("events endpoint validates input", async ({ request }) => {
    const ok = await request.post("/api/events", {
      data: { slug: "demo", kind: "view", source: "qr" },
      headers: { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/140" },
    });
    expect(ok.status()).toBe(204);
    const bad = await request.post("/api/events", {
      data: { slug: "../etc", kind: "hack" },
      headers: { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/140" },
    });
    expect(bad.status()).toBe(400);
  });

  test("wallet endpoints explain missing configuration", async ({ request }) => {
    const apple = await request.get("/api/pass/apple?demo=1");
    expect([200, 503]).toContain(apple.status());
    if (apple.status() === 503) expect((await apple.json()).error).toBe("not_configured");

    const google = await request.get("/api/pass/google?demo=1", { maxRedirects: 0 });
    expect([303, 503]).toContain(google.status());
  });

  test("apple web service is closed without configuration", async ({ request }) => {
    const response = await request.get("/api/wallet/v1/devices/abc/registrations/pass.app.passme");
    expect(response.status()).toBe(404);
  });

  test("sign-out only accepts POST", async ({ request }) => {
    const response = await request.get("/auth/signout");
    expect(response.status()).toBe(405);
  });
});
