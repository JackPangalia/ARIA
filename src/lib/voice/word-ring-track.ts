import {
  fitRingText,
  scrambleFiller,
  type CharWidth,
} from "@/lib/voice/word-ring-text";

/**
 * A glyph sitting on the ring. `live` letters are spoken words; the rest is the
 * cipher that closes the circle. `seed` is stable for a glyph's whole life so
 * its wobble phase never jumps when the ticker scrolls, and `revealedAt` is the
 * timestamp it was typed (0 for text that arrived without an animation).
 */
export type RingGlyph = {
  ch: string;
  width: number;
  live: boolean;
  seed: number;
  revealedAt: number;
};

/** Below this a glyph can't advance the pack, so filling would never terminate. */
const MIN_GLYPH_WIDTH = 0.5;

/**
 * The ring's content model: live speech packed against the cipher that fills the
 * rest of the circle, maintained incrementally.
 *
 * The renderer appends one character at a time at speaking speed, so every
 * operation here is O(1) amortized — re-packing the whole ring per keystroke
 * (measure text, refit, refill, re-render) was what made the old ring stutter
 * once a sentence got long.
 */
export class RingTrack {
  readonly live: RingGlyph[] = [];
  readonly filler: RingGlyph[] = [];

  private liveWidth = 0;
  private fillerWidth = 0;
  private text = "";
  private seedAt = 0;

  constructor(
    private readonly pathLength: number,
    private widthOf: CharWidth,
    private readonly pool: string,
    private readonly maxGlyphs: number,
  ) {
    this.refill();
  }

  /** The live text currently on the ring — the ticker's own idea of "displayed". */
  get liveText(): string {
    return this.text;
  }

  get glyphCount(): number {
    return this.live.length + this.filler.length;
  }

  /** Arc the live speech currently claims, in path units. */
  get liveArc(): number {
    return this.liveWidth;
  }

  /** Type one more character of speech onto the head of the ring. */
  append(ch: string, now: number): void {
    this.live.push(this.glyph(ch, true, now));
    this.liveWidth += this.live[this.live.length - 1]!.width;
    this.text += ch;
    this.trimLive();
    this.refill();
  }

  /** Replace the live text outright — a rewritten transcript, not new speech. */
  snap(text: string): void {
    const fitted = fitRingText(text, this.pathLength, this.widthOf);
    if (fitted === this.text) return;
    this.live.length = 0;
    this.liveWidth = 0;
    this.text = fitted;
    for (const ch of Array.from(fitted)) {
      const glyph = this.glyph(ch, true, 0);
      this.live.push(glyph);
      this.liveWidth += glyph.width;
    }
    this.refill();
  }

  /** Swap one cipher letter for another; middots are left alone. */
  scramble(at: number, glyphIndex: number): boolean {
    const glyph = this.filler[at];
    if (!glyph) return false;
    const next = scrambleFiller(glyph.ch, 0, glyphIndex);
    if (next === glyph.ch) return false;
    const width = this.measure(next);
    this.fillerWidth += width - glyph.width;
    glyph.ch = next;
    glyph.width = width;
    this.refill();
    return true;
  }

  /**
   * Re-measure every glyph against a new width function — the webfont finished
   * loading, or the ring switched voice. Without this the ring keeps the fallback
   * font's metrics forever and packs visibly loose or overlapped.
   */
  remeasure(widthOf: CharWidth): void {
    this.widthOf = widthOf;
    this.liveWidth = 0;
    for (const glyph of this.live) {
      glyph.width = this.measure(glyph.ch);
      this.liveWidth += glyph.width;
    }
    this.fillerWidth = 0;
    for (const glyph of this.filler) {
      glyph.width = this.measure(glyph.ch);
      this.fillerWidth += glyph.width;
    }
    this.trimLive();
    this.refill();
  }

  /** Drop all live speech back to a bare cipher ring. */
  clear(): void {
    this.live.length = 0;
    this.liveWidth = 0;
    this.text = "";
    this.refill();
  }

  private glyph(ch: string, live: boolean, revealedAt: number): RingGlyph {
    this.seedAt += 1;
    return {
      ch,
      width: this.measure(ch),
      live,
      seed: this.seedAt,
      revealedAt,
    };
  }

  private measure(ch: string): number {
    const width = this.widthOf(ch);
    return Number.isFinite(width) && width > 0 ? width : 0;
  }

  /** Speech owns the whole ring; oldest letters scroll off the start. */
  private trimLive(): void {
    while (this.liveWidth > this.pathLength && this.live.length > 1) {
      const dropped = this.live.shift()!;
      this.liveWidth -= dropped.width;
      this.text = this.text.slice(dropped.ch.length);
    }
  }

  /** Top the cipher up to (or trim it back to) the remaining arc. */
  private refill(): void {
    let total = this.liveWidth + this.fillerWidth;

    while (this.filler.length > 0 && total > this.pathLength) {
      const dropped = this.filler.pop()!;
      this.fillerWidth -= dropped.width;
      total -= dropped.width;
    }

    while (total < this.pathLength && this.glyphCount < this.maxGlyphs) {
      // Indexed by position, not by a running cursor, so the cipher's middot
      // rhythm stays anchored to the end of the live text as it grows.
      const ch = this.pool[this.filler.length % this.pool.length]!;
      const glyph = this.glyph(ch, false, 0);
      if (glyph.width < MIN_GLYPH_WIDTH) return;
      this.filler.push(glyph);
      this.fillerWidth += glyph.width;
      total += glyph.width;
    }
  }
}
