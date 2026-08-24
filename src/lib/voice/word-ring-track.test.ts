import { describe, expect, it } from "vitest";
import { RingTrack } from "@/lib/voice/word-ring-track";

/** Every glyph is one unit wide, so widths read as counts. */
const unit = () => 1;

function track(pathLength = 10, pool = "xyz", max = 64) {
  return new RingTrack(pathLength, unit, pool, max);
}

function ringText(subject: RingTrack): string {
  return [...subject.live, ...subject.filler].map((g) => g.ch).join("");
}

describe("RingTrack", () => {
  it("fills the whole ring with cipher before anyone speaks", () => {
    const subject = track();
    expect(subject.liveText).toBe("");
    expect(subject.glyphCount).toBe(10);
    expect(ringText(subject)).toBe("xyzxyzxyzx");
  });

  it("gives back arc to speech as it types", () => {
    const subject = track();
    for (const ch of "hi") subject.append(ch, 1000);
    expect(subject.liveText).toBe("hi");
    expect(subject.glyphCount).toBe(10);
    expect(ringText(subject)).toBe("hixyzxyzxy");
  });

  it("scrolls the oldest letters off once speech fills the ring", () => {
    const subject = track();
    for (const ch of "abcdefghijklm") subject.append(ch, 1000);
    expect(subject.liveText).toBe("defghijklm");
    expect(subject.filler).toHaveLength(0);
  });

  it("keeps a glyph's wobble seed stable while it rides the ring", () => {
    const subject = track();
    for (const ch of "abc") subject.append(ch, 1000);
    const seed = subject.live[2]!.seed;
    subject.append("d", 1100);
    expect(subject.live[2]!.seed).toBe(seed);
  });

  it("stamps typed letters so they can ignite, but not snapped ones", () => {
    const subject = track();
    subject.append("a", 900);
    expect(subject.live[0]!.revealedAt).toBe(900);
    subject.snap("zz");
    expect(subject.live.map((g) => g.revealedAt)).toEqual([0, 0]);
  });

  it("snaps to the newest suffix that fits and refills behind it", () => {
    const subject = track();
    subject.snap("abcdefghijklm");
    expect(subject.liveText).toBe("defghijklm");
    expect(subject.glyphCount).toBe(10);
  });

  it("returns to a bare cipher ring when speech is cleared", () => {
    const subject = track();
    for (const ch of "hello") subject.append(ch, 1000);
    subject.clear();
    expect(subject.liveText).toBe("");
    expect(subject.glyphCount).toBe(10);
  });

  it("swaps a cipher letter without changing how much arc it covers", () => {
    const subject = track();
    expect(subject.scramble(0, 3)).toBe(true);
    expect(subject.filler[0]!.ch).not.toBe("x");
    expect(subject.glyphCount).toBe(10);
  });

  it("leaves middots alone", () => {
    const subject = track(4, "·");
    expect(subject.scramble(0, 3)).toBe(false);
    expect(subject.filler[0]!.ch).toBe("·");
  });

  it("re-packs against new metrics when the webfont lands", () => {
    const subject = track();
    for (const ch of "hi") subject.append(ch, 1000);
    subject.remeasure((ch) => (ch === "h" || ch === "i" ? 3 : 1));
    // Speech now eats six units of arc, so the cipher gives four back.
    expect(subject.filler).toHaveLength(4);
    expect(subject.liveText).toBe("hi");
  });

  it("re-packs speech that no longer fits after re-measuring", () => {
    const subject = track();
    for (const ch of "abcdefgh") subject.append(ch, 1000);
    subject.remeasure(() => 2);
    expect(subject.liveText).toBe("defgh");
    expect(subject.filler).toHaveLength(0);
  });

  it("never exceeds the glyph budget it was given", () => {
    const subject = track(1000, "xyz", 24);
    expect(subject.glyphCount).toBe(24);
  });

  it("stops filling instead of spinning when glyphs measure to nothing", () => {
    const subject = new RingTrack(10, () => 0, "xyz", 64);
    expect(subject.glyphCount).toBe(0);
  });
});
