import { describe, expect, it } from "vitest";
import {
  VoicePhraseBuffer,
  WordStreamBuffer,
  stripMarkdownForSpeech,
} from "./tts-phrase-buffer";

describe("VoicePhraseBuffer", () => {
  it("waits for a natural sentence boundary instead of emitting comma fragments", () => {
    const buffer = new VoicePhraseBuffer();

    expect(buffer.push("The answer is yes, and here is why, ")).toEqual([]);
    expect(buffer.push("the measured result is faster. ")).toEqual([
      "The answer is yes, and here is why, the measured result is faster.",
    ]);
  });

  it("preserves a final sentence without trailing whitespace", () => {
    const buffer = new VoicePhraseBuffer();
    buffer.push("Short answer.");
    expect(buffer.finish()).toEqual(["Short answer."]);
  });

  it("combines tiny opening sentences to avoid choppy synthesis", () => {
    const buffer = new VoicePhraseBuffer();
    expect(buffer.push("Yes. ")).toEqual([]);
    expect(buffer.push("That is the right option. ")).toEqual([
      "Yes. That is the right option.",
    ]);
  });
});


describe("WordStreamBuffer", () => {
  it("holds an unpunctuated opener until a short clause or ~24 characters", () => {
    const buffer = new WordStreamBuffer();
    expect(buffer.push("The free ")).toEqual([]);
    expect(buffer.push("plan ")).toEqual([]);
    expect(buffer.push("gets people ")).toEqual([
      "The free plan gets people ",
    ]);
    expect(buffer.push("in the door, ")).toEqual(["in the door, "]);
  });

  it("does not wait on a clause boundary that lands past the first-flush ceiling", () => {
    const buffer = new WordStreamBuffer();
    // The comma sits at ~63 chars. Chasing it would hold the answer's first
    // audio until the model had written all of it.
    const opener =
      "There are a couple of ways you could approach that problem, honestly. ";
    const [first] = buffer.push(opener);
    expect(first).toBeDefined();
    expect(first!.length).toBeLessThanOrEqual(48);
    expect(opener.startsWith(first!)).toBe(true);
    expect(first!.endsWith(" ")).toBe(true);
  });

  it("flushes the first fragment at a sentence end even when it is short", () => {
    const buffer = new WordStreamBuffer();
    expect(buffer.push("Yes. ")).toEqual(["Yes. "]);
    expect(buffer.push("That is the right option. ")).toEqual([
      "That is the right option. ",
    ]);
  });

  it("does not treat a thousands comma as a clause boundary", () => {
    const buffer = new WordStreamBuffer();
    expect(buffer.push("About 1,234 extra ")).toEqual([]);
    expect(buffer.push("people showed up today ")).toEqual([
      "About 1,234 extra people showed up today ",
    ]);
  });

  it("flushes word-aligned fragments once past the minimum size", () => {
    const buffer = new WordStreamBuffer(12);
    const out: string[] = [];
    for (const token of ["The free", " plan gets", " people in", " the door."]) {
      out.push(...buffer.push(token));
    }
    out.push(...buffer.finish());
    expect(out.join("")).toBe("The free plan gets people in the door.");
    // Every fragment except possibly the last ends at a word boundary.
    for (const fragment of out.slice(0, -1)) {
      expect(fragment.endsWith(" ") || fragment.endsWith("\n")).toBe(true);
    }
    expect(out.length).toBeGreaterThan(1);
  });

  it("never splits a word", () => {
    const buffer = new WordStreamBuffer(4);
    const out = [
      ...buffer.push("extraordinarily"),
      ...buffer.push(" long"),
      ...buffer.finish(),
    ];
    expect(out.join("")).toBe("extraordinarily long");
    expect(out[0]).toBe("extraordinarily ");
  });

  it("emits nothing for whitespace-only input", () => {
    const buffer = new WordStreamBuffer(4);
    expect([...buffer.push("   "), ...buffer.finish()]).toEqual([]);
  });
});

describe("stripMarkdownForSpeech", () => {
  it("removes markdown headers, bold, italics, bullets, backticks, and links", () => {
    const input =
      "### Summary\n- **Item 1**: `code` and *italic*\n[Check this](https://example.com)";
    const cleaned = stripMarkdownForSpeech(input);
    expect(cleaned).toBe("Summary\nItem 1: code and italic\nCheck this");
    expect(cleaned).not.toContain("#");
    expect(cleaned).not.toContain("*");
    expect(cleaned).not.toContain("`");
    expect(cleaned).not.toContain("https");
  });
});
