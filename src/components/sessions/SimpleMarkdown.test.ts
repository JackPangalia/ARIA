import { describe, expect, it } from "vitest";
import { safeMarkdownLinkHref } from "./SimpleMarkdown";

describe("safeMarkdownLinkHref", () => {
  it.each([
    "https://kivo.app/help",
    "http://localhost:3000/docs",
    "mailto:hello@kivo.app",
  ])("allows %s links", (href) => {
    expect(safeMarkdownLinkHref(href)).toBe(href);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "file:///tmp/private",
    "/relative/path",
    "not a URL",
  ])("rejects unsupported link %s", (href) => {
    expect(safeMarkdownLinkHref(href)).toBeNull();
  });
});
