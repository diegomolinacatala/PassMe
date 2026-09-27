import { describe, expect, it } from "vitest";
import { linkDisplay, linkHref, linkTitle, normalizeLinkValue, parseHttpUrl } from "@/lib/card/links";

function value(kind: Parameters<typeof normalizeLinkValue>[0], raw: string): string {
  const result = normalizeLinkValue(kind, raw);
  if (!result.ok) throw new Error(`expected ok for ${kind}:${raw}, got ${result.error}`);
  return result.value;
}

function rejects(kind: Parameters<typeof normalizeLinkValue>[0], raw: string): void {
  expect(normalizeLinkValue(kind, raw).ok).toBe(false);
}

describe("parseHttpUrl", () => {
  it("adds https to bare domains", () => {
    expect(parseHttpUrl("example.com")?.toString()).toBe("https://example.com/");
  });

  it("rejects dangerous or malformed schemes", () => {
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpUrl("data:text/html,hi")).toBeNull();
    expect(parseHttpUrl("ftp://example.com")).toBeNull();
    expect(parseHttpUrl("https://user:pass@example.com")).toBeNull();
    expect(parseHttpUrl("localhost")).toBeNull();
    expect(parseHttpUrl("https://exa mple.com")).toBeNull();
  });
});

describe("email", () => {
  it("lowercases and builds mailto", () => {
    expect(value("email", "  Alex@Example.COM ")).toBe("alex@example.com");
    expect(linkHref("email", "alex@example.com")).toBe("mailto:alex@example.com");
  });

  it("rejects invalid emails", () => {
    rejects("email", "alex");
    rejects("email", "alex@example");
    rejects("email", "a b@example.com");
    rejects("email", "");
  });
});

describe("phone & whatsapp", () => {
  it("keeps readable formatting but dials digits", () => {
    expect(value("phone", "0034 600 11 22 33")).toBe("+34 600 11 22 33");
    expect(linkHref("phone", "+34 600 11 22 33")).toBe("tel:+34600112233");
    expect(linkHref("phone", "600 11 22 33")).toBe("tel:600112233");
  });

  it("requires an international prefix for WhatsApp", () => {
    rejects("whatsapp", "600 11 22 33");
    expect(linkHref("whatsapp", value("whatsapp", "+34 600-112-233"))).toBe("https://wa.me/34600112233");
  });

  it("rejects letters and too-short numbers", () => {
    rejects("phone", "call me");
    rejects("phone", "123");
  });
});

describe("linkedin", () => {
  it("accepts handles and profile URLs", () => {
    expect(value("linkedin", "alex-rivera")).toBe("https://www.linkedin.com/in/alex-rivera");
    expect(value("linkedin", "https://es.linkedin.com/in/alex-rivera/?originalSubdomain=es")).toBe(
      "https://www.linkedin.com/in/alex-rivera",
    );
    expect(value("linkedin", "linkedin.com/company/acme")).toBe("https://www.linkedin.com/company/acme");
  });

  it("rejects non-LinkedIn hosts and feed URLs", () => {
    rejects("linkedin", "https://evil.com/in/alex");
    rejects("linkedin", "https://www.linkedin.com/feed/");
  });

  it("displays the path", () => {
    expect(linkDisplay("linkedin", "https://www.linkedin.com/in/alex-rivera")).toBe("in/alex-rivera");
  });
});

describe("social handles", () => {
  it("normalizes @handles and URLs to the bare handle", () => {
    expect(value("instagram", "@estudio.norte")).toBe("estudio.norte");
    expect(value("instagram", "https://www.instagram.com/estudio.norte/")).toBe("estudio.norte");
    expect(value("x", "twitter.com/alex_r")).toBe("alex_r");
    expect(value("github", "github.com/octocat")).toBe("octocat");
    expect(value("tiktok", "https://www.tiktok.com/@alex.r")).toBe("alex.r");
    expect(value("telegram", "t.me/alexrivera")).toBe("alexrivera");
  });

  it("builds canonical hrefs", () => {
    expect(linkHref("instagram", "estudio.norte")).toBe("https://www.instagram.com/estudio.norte");
    expect(linkHref("x", "alex_r")).toBe("https://x.com/alex_r");
    expect(linkHref("tiktok", "alex.r")).toBe("https://www.tiktok.com/@alex.r");
  });

  it("rejects wrong hosts, bare hosts and invalid handles", () => {
    rejects("instagram", "https://evil.com/alex");
    rejects("instagram", "instagram.com");
    rejects("x", "this_handle_is_way_too_long");
    rejects("github", "-bad");
    rejects("telegram", "abc");
  });
});

describe("youtube", () => {
  it("accepts handles and channel URLs", () => {
    expect(value("youtube", "@midudev")).toBe("https://www.youtube.com/@midudev");
    expect(value("youtube", "https://www.youtube.com/channel/UC123")).toBe("https://www.youtube.com/channel/UC123");
    expect(linkDisplay("youtube", "https://www.youtube.com/@midudev")).toBe("@midudev");
  });

  it("rejects other hosts", () => {
    rejects("youtube", "https://vimeo.com/alex");
  });
});

describe("web links", () => {
  it("normalizes URLs and prettifies display", () => {
    expect(value("website", "example.com")).toBe("https://example.com");
    expect(value("custom", "https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(linkDisplay("website", "https://www.example.com/")).toBe("example.com");
  });

  it("rejects javascript: URLs everywhere", () => {
    rejects("website", "javascript:alert(1)");
    rejects("custom", "JAVASCRIPT:alert(1)");
    rejects("booking", "data:text/html;base64,xx");
  });

  it("rejects overly long values", () => {
    rejects("website", `https://example.com/${"a".repeat(400)}`);
  });
});

describe("linkTitle", () => {
  it("prefers a custom label", () => {
    expect(linkTitle({ kind: "website", label: "Portfolio" })).toBe("Portfolio");
    expect(linkTitle({ kind: "website" })).toBe("Web");
    expect(linkTitle({ kind: "website", label: "   " })).toBe("Web");
  });
});
