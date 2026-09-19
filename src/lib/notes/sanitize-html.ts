/**
 * Notes are stored as a small, fixed subset of HTML — the shapes the editor can
 * produce and the model is told to write: headings, paragraphs, lists,
 * emphasis. Everything else (attributes included) is stripped, whether it came
 * from the editor, the clipboard, or the model. Regex-based because it runs on
 * the server with no DOM; the allowlist is small enough that a tokenizer is
 * not needed.
 */

const ALLOWED_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "p",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "br",
  "blockquote",
]);

/** Elements whose *content* is dropped too, not just the tags. */
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|template|noscript|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

const TAG = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)\b[^<>]*\/?\s*>/g;

/** Upper bound on a stored notes document; well under Firestore's 1 MiB. */
export const MAX_NOTES_HTML_CHARS = 200_000;

export function sanitizeNotesHtml(input: string): string {
  let html = input.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(DROP_WITH_CONTENT, "");
  html = html.replace(TAG, (_match, slash: string, rawName: string) => {
    const name = rawName.toLowerCase();
    const tag =
      name === "b" ? "strong" : name === "i" ? "em" : name === "div" ? "p" : name;
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (tag === "br") return slash ? "" : "<br>";
    return `<${slash ? "/" : ""}${tag}>`;
  });
  return html.trim();
}

/**
 * The model is asked for bare HTML but sometimes wraps it in a code fence or
 * a document skeleton anyway. Peel those off before sanitizing.
 */
export function unwrapModelHtml(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();
  const body = text.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (body) text = body[1].trim();
  return text;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => ENTITIES[match] ?? match)
    .replace(/&#(\d+);/g, (_m, code: string) => {
      const point = Number(code);
      return Number.isFinite(point) && point > 0 && point < 0x110000
        ? String.fromCodePoint(point)
        : "";
    });
}

/**
 * Plain text for prompts and clipboards: block boundaries become newlines and
 * list items keep a leading dash so structure survives without markup.
 */
export function notesHtmlToText(html: string): string {
  let text = html;
  text = text.replace(/<li\b[^>]*>/gi, "- ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|h1|h2|h3|li|blockquote|ul|ol)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function notesHtmlIsEmpty(html: string): boolean {
  return notesHtmlToText(html).length === 0;
}

/**
 * Markdown for export and the clipboard's text flavor. Only the tags the
 * sanitizer allows are handled, so it stays a straight translation.
 */
export function notesHtmlToMarkdown(html: string): string {
  let text = html;
  text = text.replace(/<h1\b[^>]*>/gi, "# ").replace(/<h2\b[^>]*>/gi, "## ").replace(/<h3\b[^>]*>/gi, "### ");
  text = text.replace(/<\/?strong>/gi, "**").replace(/<\/?em>/gi, "_");
  text = text.replace(/<blockquote\b[^>]*>/gi, "> ").replace(/<\/blockquote>/gi, "\n");
  // Ordered lists number their items; nested lists are flattened.
  text = text.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner: string) => {
    let index = 0;
    return inner.replace(/<li\b[^>]*>/gi, () => `${++index}. `);
  });
  text = text.replace(/<li\b[^>]*>/gi, "- ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|h1|h2|h3|li|ul|ol)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
