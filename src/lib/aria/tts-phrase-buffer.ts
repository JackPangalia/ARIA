/**
 * Strips Markdown formatting symbols before sending text to TTS so Cartesia
 * never speaks aloud asterisks, hashes, backticks, or link syntax.
 */
export function stripMarkdownForSpeech(text: string): string {
  if (!text) return "";
  let result = text;

  // Replace markdown links [label](url) -> label
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Remove URLs
  result = result.replace(/https?:\/\/\S+/gi, "");

  // Remove header hashes at start of line or after newline
  result = result.replace(/(^|\n)#{1,6}\s+/g, "$1");

  // Remove list bullets / blockquotes at start of line
  result = result.replace(/(^|\n)\s*[-*+>]+\s+/g, "$1");

  // Remove ordered list numbers at start of line (e.g. "1. ")
  result = result.replace(/(^|\n)\s*\d+\.\s+/g, "$1");

  // Remove inline formatting chars: *, _, ~, `
  result = result.replace(/[\*\_~`]+/g, "");

  // Collapse excess whitespace / double newlines
  return result.replace(/[ \t]+/g, " ").trim();
}

const SENTENCE_BOUNDARY = /[.!?]+["')\]]*\s+|\n+/;

/**
 * Word-level streaming buffer for the single-context Cartesia WebSocket path.
 * Unlike VoicePhraseBuffer (which holds text until a full sentence — adding
 * most of a sentence's worth of latency before the first audio), this flushes
 * small word-aligned fragments as the LLM streams. The first flush is shorter
 * so first-audio is one short clause; later flushes stay a bit larger so
 * Cartesia's continuation mode can join them. Never splits mid-word.
 */
export class WordStreamBuffer {
  private buffer = "";
  private emitted = 0;

  constructor(
    private readonly firstMinChars = 20,
    private readonly nextMinChars = 12
  ) {}

  push(token: string): string[] {
    this.buffer += token;
    const minimum = this.emitted === 0 ? this.firstMinChars : this.nextMinChars;
    if (this.buffer.length < minimum) return [];
    // Flush up to the last whitespace so words stay intact; keep the tail.
    const cut = Math.max(
      this.buffer.lastIndexOf(" "),
      this.buffer.lastIndexOf("\n")
    );
    if (cut <= 0) return [];
    const out = this.buffer.slice(0, cut + 1);
    this.buffer = this.buffer.slice(cut + 1);
    if (!out.trim()) return [];
    this.emitted += 1;
    return [out];
  }

  finish(): string[] {
    const out = this.buffer;
    this.buffer = "";
    return out.trim() ? [out] : [];
  }
}

export class VoicePhraseBuffer {
  private buffer = "";
  private pending = "";
  private emitted = 0;

  constructor(
    private readonly firstMinChars = 18,
    private readonly nextMinChars = 60
  ) {}

  push(token: string): string[] {
    this.buffer += token;
    return this.extract();
  }

  finish(): string[] {
    this.pending += this.buffer;
    this.buffer = "";
    const text = this.pending.trim();
    this.pending = "";
    if (!text) return [];
    this.emitted += 1;
    return [text];
  }

  private extract(): string[] {
    const output: string[] = [];
    while (true) {
      const match = SENTENCE_BOUNDARY.exec(this.buffer);
      if (!match) break;
      const end = match.index + match[0].length;
      this.pending += this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end);
      const minimum = this.emitted === 0 ? this.firstMinChars : this.nextMinChars;
      if (this.pending.trim().length >= minimum) {
        output.push(this.pending.trim());
        this.pending = "";
        this.emitted += 1;
      }
    }
    return output;
  }
}

