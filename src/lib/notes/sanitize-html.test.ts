import { describe, expect, it } from "vitest";
import {
  notesHtmlIsEmpty,
  notesHtmlToMarkdown,
  notesHtmlToText,
  sanitizeNotesHtml,
  unwrapModelHtml,
} from "@/lib/notes/sanitize-html";

describe("sanitizeNotesHtml", () => {
  it("keeps the editor's subset and drops everything else", () => {
    const input =
      '<h2 class="x" onclick="alert(1)">Plan</h2><p>Ship <strong>Friday</strong> <em>maybe</em></p><ul><li>one</li></ul><table><tr><td>cell</td></tr></table>';
    expect(sanitizeNotesHtml(input)).toBe(
      "<h2>Plan</h2><p>Ship <strong>Friday</strong> <em>maybe</em></p><ul><li>one</li></ul>cell"
    );
  });

  it("removes scripts and styles with their content", () => {
    expect(
      sanitizeNotesHtml('<p>hi</p><script>alert("x")</script><style>p{}</style>')
    ).toBe("<p>hi</p>");
  });

  it("strips attributes, normalizes b/i/div, and self-closing br", () => {
    expect(sanitizeNotesHtml('<div id="a"><b>x</b><i>y</i><br/></div>')).toBe(
      "<p><strong>x</strong><em>y</em><br></p>"
    );
  });

  it("does not let an href or javascript: URL survive", () => {
    expect(sanitizeNotesHtml('<a href="javascript:alert(1)">link</a>')).toBe("link");
  });
});

describe("unwrapModelHtml", () => {
  it("peels code fences and body wrappers", () => {
    expect(unwrapModelHtml("```html\n<p>a</p>\n```")).toBe("<p>a</p>");
    expect(unwrapModelHtml("<html><body><p>a</p></body></html>")).toBe("<p>a</p>");
    expect(unwrapModelHtml("<p>a</p>")).toBe("<p>a</p>");
  });
});

describe("notesHtmlToText", () => {
  it("keeps block structure and list dashes, decodes entities", () => {
    expect(
      notesHtmlToText("<h2>Plan</h2><p>A &amp; B</p><ul><li>one</li><li>two</li></ul>")
    ).toBe("Plan\nA & B\n- one\n- two");
  });

  it("treats whitespace-only documents as empty", () => {
    expect(notesHtmlIsEmpty("<p></p><p> </p>")).toBe(true);
    expect(notesHtmlIsEmpty("<p>x</p>")).toBe(false);
  });
});

describe("notesHtmlToMarkdown", () => {
  it("renders headings, emphasis, and both list kinds", () => {
    expect(
      notesHtmlToMarkdown(
        "<h1>T</h1><p><strong>bold</strong> and <em>it</em></p><ol><li>a</li><li>b</li></ol><ul><li>c</li></ul>"
      )
    ).toBe("# T\n**bold** and _it_\n1. a\n2. b\n- c");
  });
});
