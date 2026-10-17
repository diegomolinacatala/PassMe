import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ContactRequest } from "@/lib/card/contact";

vi.mock("@/app/dashboard/actions", () => ({ deleteContactRequestAction: vi.fn() }));

const { ContactsPanel } = await import("@/components/editor/contacts-panel");

const request = (overrides: Partial<ContactRequest> = {}): ContactRequest => ({
  id: "c1",
  name: "Lucía Ferrer",
  email: "lucia@example.com",
  phone: null,
  company: "Mirador",
  message: "",
  source: "qr",
  createdAt: "2026-10-01T10:00:00Z",
  ...overrides,
});

const render = (props: { requests?: ContactRequest[]; available?: boolean; failed?: boolean; enabled?: boolean }) =>
  renderToStaticMarkup(
    createElement(ContactsPanel, { requests: [], available: true, enabled: true, demo: false, ...props }),
  );

describe("ContactsPanel", () => {
  it("says it couldn't load the contacts, instead of 'nobody yet'", () => {
    const html = render({ failed: true });
    expect(html).toContain("No hemos podido cargar tus contactos. Recarga.");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("Aún no te ha dejado nadie");
    // The anchor and focus target stay, so /dashboard#contactos still lands here.
    expect(html).toContain('id="contactos"');
  });

  it("shows the real empty state when there are simply none", () => {
    expect(render({})).toContain("Aún no te ha dejado nadie su contacto");
    expect(render({})).not.toContain("No hemos podido cargar");
    expect(render({ enabled: false })).toContain("Activa «Recibir contactos»");
  });

  it("lists what it has even if the flag is set", () => {
    const html = render({ requests: [request()], failed: true });
    expect(html).toContain("Lucía Ferrer");
    expect(html).not.toContain("No hemos podido cargar");
  });

  it("keeps the pending-migration message", () => {
    expect(render({ available: false })).toContain("Esta función aún no está disponible.");
  });

  it("prints dates in Madrid's calendar, whatever the server's time zone", () => {
    // 22:30 UTC on 1 October is already 2 October in Madrid (UTC+2).
    expect(render({ requests: [request({ createdAt: "2026-10-01T22:30:00Z" })] })).toContain("2 oct");
    // ...and the edge of 31 March / 1 April, with summer time (UTC+2) already on.
    expect(render({ requests: [request({ createdAt: "2026-03-31T21:30:00Z" })] })).toContain("31 mar");
    expect(render({ requests: [request({ createdAt: "2026-03-31T22:30:00Z" })] })).toContain("1 abr");
  });
});
