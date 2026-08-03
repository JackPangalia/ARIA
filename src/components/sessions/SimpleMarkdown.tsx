"use client";

import type { ReactNode } from "react";

/**
 * A tiny, dependency-free Markdown renderer — enough for the shapes Kivo's
 * answers actually use (headings, bold/italic, inline code, links, ordered and
 * unordered lists, paragraphs). Renders to React nodes, so there's no HTML
 * injection surface. Not a spec-complete parser; deliberately small.
 */

export function safeMarkdownLinkHref(rawHref: string): string | null {
  try {
    const protocol = new URL(rawHref).protocol;
    return protocol === "http:" ||
      protocol === "https:" ||
      protocol === "mailto:"
      ? rawHref
      : null;
  } catch {
    return null;
  }
}

const INLINE_PATTERNS: {
  re: RegExp;
  render: (m: RegExpExecArray, key: string) => ReactNode;
}[] = [
  {
    re: /`([^`]+)`/,
    render: (m, key) => (
      <code
        key={key}
        className="rounded bg-surface-hover px-1 py-0.5 font-mono text-[0.85em]"
      >
        {m[1]}
      </code>
    ),
  },
  {
    re: /\*\*([^*]+)\*\*/,
    render: (m, key) => (
      <strong key={key} className="font-semibold">
        {m[1]}
      </strong>
    ),
  },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    render: (m, key) => {
      const href = safeMarkdownLinkHref(m[2]);
      return href ? (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {m[1]}
        </a>
      ) : (
        <span key={key}>{m[1]}</span>
      );
    },
  },
  {
    re: /\*([^*\n]+)\*/,
    render: (m, key) => <em key={key}>{m[1]}</em>,
  },
];

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let n = 0;
  while (remaining.length > 0) {
    let best: { index: number; length: number; node: ReactNode } | null = null;
    for (const p of INLINE_PATTERNS) {
      const m = p.re.exec(remaining);
      if (m && (best === null || m.index < best.index)) {
        best = {
          index: m.index,
          length: m[0].length,
          node: p.render(m, `${keyPrefix}-${n}`),
        };
      }
    }
    if (!best) {
      nodes.push(remaining);
      break;
    }
    if (best.index > 0) nodes.push(remaining.slice(0, best.index));
    nodes.push(best.node);
    remaining = remaining.slice(best.index + best.length);
    n += 1;
  }
  return nodes;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const ORDERED = /^\s*\d+\.\s+(.*)$/;
const UNORDERED = /^\s*[-*+]\s+(.*)$/;

export function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level <= 1
          ? "mt-5 mb-2 text-lg font-semibold"
          : level === 2
            ? "mt-5 mb-1.5 text-base font-semibold"
            : "mt-4 mb-1 text-sm font-semibold";
      blocks.push(
        <div key={key} className={cls}>
          {renderInline(heading[2], `h-${key}`)}
        </div>
      );
      key += 1;
      i += 1;
      continue;
    }

    if (ORDERED.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && ORDERED.test(lines[i])) {
        const m = ORDERED.exec(lines[i])!;
        items.push(
          <li key={items.length} className="pl-1.5 leading-relaxed">
            {renderInline(m[1], `ol-${key}-${items.length}`)}
          </li>
        );
        i += 1;
      }
      blocks.push(
        <ol key={key} className="my-2 list-decimal space-y-1.5 pl-6">
          {items}
        </ol>
      );
      key += 1;
      continue;
    }

    if (UNORDERED.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && UNORDERED.test(lines[i])) {
        const m = UNORDERED.exec(lines[i])!;
        items.push(
          <li key={items.length} className="pl-1.5 leading-relaxed">
            {renderInline(m[1], `ul-${key}-${items.length}`)}
          </li>
        );
        i += 1;
      }
      blocks.push(
        <ul key={key} className="my-2 list-disc space-y-1.5 pl-6">
          {items}
        </ul>
      );
      key += 1;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING.test(lines[i]) &&
      !ORDERED.test(lines[i]) &&
      !UNORDERED.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key} className="leading-relaxed">
        {renderInline(para.join(" "), `p-${key}`)}
      </p>
    );
    key += 1;
  }

  return <div className="space-y-1">{blocks}</div>;
}
