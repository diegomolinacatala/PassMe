import QRCode from "qrcode";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QrCode } from "@/components/card/qr-code";

const render = (value: string, quietZone?: number) =>
  renderToStaticMarkup(createElement(QrCode, { value, label: "QR", quietZone }));

/** The dark modules a rendered path draws, as "col,row" (quiet zone removed). */
function drawnModules(markup: string, quietZone: number): Set<string> {
  const d = /<path d="([^"]*)"/.exec(markup)?.[1] ?? "";
  const dark = new Set<string>();
  for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(w); i += 1) dark.add(`${Number(x) - quietZone + i},${Number(y) - quietZone}`);
  }
  return dark;
}

describe("QrCode", () => {
  it.each(["https://getpassme.com/u/demo?src=qr", "https://getpassme.com/u/ana-lopez-garcia?src=share", "https://getpassme.com/"])(
    "draws exactly the modules of the code for %s",
    (value) => {
      for (const quietZone of [1, 2]) {
        const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
        const expected = new Set<string>();
        for (let row = 0; row < qr.modules.size; row += 1) {
          for (let col = 0; col < qr.modules.size; col += 1) if (qr.modules.get(row, col)) expected.add(`${col},${row}`);
        }
        const markup = render(value, quietZone);
        expect(drawnModules(markup, quietZone)).toEqual(expected);
        expect(markup).toContain(`viewBox="0 0 ${qr.modules.size + quietZone * 2} ${qr.modules.size + quietZone * 2}"`);
      }
    },
  );

  it("joins runs of dark modules: about half the bytes of one square each", () => {
    const value = "https://getpassme.com/u/demo?src=qr";
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    let squares = 0;
    for (let row = 0; row < qr.modules.size; row += 1) {
      for (let col = 0; col < qr.modules.size; col += 1) if (qr.modules.get(row, col)) squares += 1;
    }
    const d = /<path d="([^"]*)"/.exec(render(value))?.[1] ?? "";
    // One "M{x} {y}h1v1h-1z" per module was ~12 bytes each.
    expect(d.length).toBeLessThan(squares * 12 * 0.6);
  });

  it("gives the same markup the second time (cached) and keeps the label and color", () => {
    const first = render("https://getpassme.com/u/cache-check?src=qr");
    expect(render("https://getpassme.com/u/cache-check?src=qr")).toBe(first);
    expect(first).toContain('aria-label="QR"');
    expect(first).toContain('fill="currentColor"');
  });
});

describe("WalletPass", () => {
  it("draws the QR it is given (the landing's, made on the server) instead of its own", async () => {
    const { WalletPass } = await import("@/components/card/wallet-pass");
    const { DEMO_CARD } = await import("@/lib/card/demo");
    const { toPublicCard } = await import("@/lib/data/cards");
    const markup = renderToStaticMarkup(
      createElement(WalletPass, { card: toPublicCard(DEMO_CARD), qr: createElement("i", { id: "given-qr" }) }),
    );
    expect(markup).toContain('<i id="given-qr"></i>');
    // The strip's container is marked so Safari < 16 can be given a width to measure.
    expect(markup).toContain('data-cq=""');
  });
});
