import { describe, expect, it } from "vitest";
import {
  MUX_FRAME_TEXT,
  MuxStreamDecoder,
  encodeMuxAudio,
  encodeMuxFrame,
  encodeMuxText,
} from "./answer-mux";

function collect() {
  const audio: Uint8Array[] = [];
  const text: string[] = [];
  const decoder = new MuxStreamDecoder({
    onAudio: (b) => audio.push(b),
    onText: (t) => text.push(t),
  });
  return { decoder, audio, text };
}

describe("answer mux codec", () => {
  it("round-trips interleaved audio and text frames", () => {
    const { decoder, audio, text } = collect();
    decoder.push(encodeMuxText("Hello "));
    decoder.push(encodeMuxAudio(new Uint8Array([1, 2, 3, 4])));
    decoder.push(encodeMuxText("world."));
    decoder.push(encodeMuxAudio(new Uint8Array([5, 6])));

    expect(text.join("")).toBe("Hello world.");
    expect(audio.map((a) => Array.from(a))).toEqual([
      [1, 2, 3, 4],
      [5, 6],
    ]);
  });

  it("reassembles frames split across arbitrary chunk boundaries", () => {
    const { decoder, audio, text } = collect();
    const payload = new Uint8Array(1000).map((_, i) => i % 256);
    const stream = new Uint8Array([
      ...encodeMuxText("Kivo speaking, prosody intact."),
      ...encodeMuxAudio(payload),
      ...encodeMuxText(" More text."),
    ]);

    for (let i = 0; i < stream.length; i += 7) {
      decoder.push(stream.slice(i, i + 7));
    }

    expect(text.join("")).toBe("Kivo speaking, prosody intact. More text.");
    expect(audio).toHaveLength(1);
    expect(Array.from(audio[0]!)).toEqual(Array.from(payload));
  });

  it("handles frames merged into a single network chunk", () => {
    const { decoder, audio, text } = collect();
    const merged = new Uint8Array([
      ...encodeMuxAudio(new Uint8Array([9])),
      ...encodeMuxAudio(new Uint8Array([8])),
      ...encodeMuxText("x"),
    ]);
    decoder.push(merged);
    expect(audio).toHaveLength(2);
    expect(text.join("")).toBe("x");
  });

  it("decodes multi-byte UTF-8 split across text frames", () => {
    const { decoder, text } = collect();
    const bytes = new TextEncoder().encode("café ☕");
    const mid = 4; // splits inside a multi-byte sequence
    decoder.push(
      new Uint8Array([
        ...encodeMuxFrame(MUX_FRAME_TEXT, bytes.slice(0, mid)),
        ...encodeMuxFrame(MUX_FRAME_TEXT, bytes.slice(mid)),
      ])
    );
    expect(text.join("")).toBe("café ☕");
  });
});
