import { joinText } from "@/lib/text/join-text";
import type { TranscriptUtterance } from "@/lib/types";

/** Same speaker-turn separator as the landing Listen overlay. */
export const RING_WORD_GAP = "\u00A0\u00A0·\u00A0\u00A0";

const FILLER_GLYPHS = "abcdefghijklmnopqrstuvwxyz";

export type RingVoice = "sans" | "serif";

export type RingMode =
  | "idle"
  | "listen"
  | "followup"
  | "wake"
  | "think"
  | "search"
  | "speak";

export type RingContent = {
  text: string;
  voice: RingVoice;
};

export type RingEdit =
  | { kind: "done" }
  | { kind: "type"; text: string }
  | { kind: "snap"; text: string };

function speakerKey(utterance: TranscriptUtterance): string {
  return utterance.providerSpeakerLabel ?? `speaker:${utterance.speaker}`;
}

/**
 * Flatten live utterances into the string that rides the word ring — spoken
 * words only, with a middle-dot between speaker turns.
 */
export function ringTextFromUtterances(
  utterances: TranscriptUtterance[],
): string {
  const groups: { key: string; text: string }[] = [];
  const sorted = [...utterances]
    .filter(
      (utterance) =>
        !utterance.overlapsAssistantSpeech && utterance.text.trim().length > 0,
    )
    .sort(
      (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id),
    );

  for (const utterance of sorted) {
    const key = speakerKey(utterance);
    const text = utterance.text.trim();
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.text = joinText(last.text, text);
      continue;
    }
    groups.push({ key, text });
  }

  return groups.map((group) => group.text).join(RING_WORD_GAP);
}

export function normalizeRingSource(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export type CharWidth = (ch: string) => number;

/**
 * Newest suffix that still fits the ring, packed to the last character so a
 * leftover word-width never sits empty. A partial oldest word at the start is
 * the ticker scrolling off.
 *
 * Widths are summed per character rather than measured per candidate substring:
 * the ring re-packs on every typed letter, and a per-substring measure made that
 * quadratic in canvas `measureText` calls.
 */
export function fitRingText(
  text: string,
  maxWidth: number,
  widthOf: CharWidth,
): string {
  const trimmed = normalizeRingSource(text);
  if (!trimmed) return "";
  if (maxWidth <= 0) return trimmed;

  const chars = Array.from(trimmed);
  let total = 0;
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    total += widthOf(chars[i]!);
    if (total > maxWidth) return chars.slice(i + 1).join("");
  }
  return trimmed;
}

/**
 * Cipher that completes the ring before anyone has spoken — letters with a
 * middot every few glyphs, same texture as live type.
 *
 * Both the letters and the middots come off one small deterministic generator.
 * A fixed stride through the alphabet is tempting but only works if it's coprime
 * with 26 — a stride of 13 collapses the whole cipher to two letters — and an
 * evenly spaced middot reads as a loading bar rather than as language.
 */
export function makeFillerPool(length = 240): string {
  const parts: string[] = [];
  let seed = 0x2f6e2b1;
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    if (i > 0 && seed % 6 === 0) {
      parts.push("·");
      continue;
    }
    parts.push(FILLER_GLYPHS[seed % FILLER_GLYPHS.length]!);
  }
  return parts.join("");
}

export function scrambleFiller(
  filler: string,
  at: number,
  glyphIndex: number,
): string {
  if (!filler || at < 0 || at >= filler.length) return filler;
  const current = filler[at];
  if (current === "·" || current === " " || current === "\u00A0") return filler;
  const glyph =
    FILLER_GLYPHS[Math.abs(glyphIndex) % FILLER_GLYPHS.length] ?? "a";
  const next =
    glyph === current
      ? (FILLER_GLYPHS[(Math.abs(glyphIndex) + 1) % FILLER_GLYPHS.length] ?? "e")
      : glyph;
  return `${filler.slice(0, at)}${next}${filler.slice(at + 1)}`;
}

/**
 * How the live ring should move toward `source`. Never rewinds: growing speech
 * types the new suffix, overflow is clipped in place, and a rewritten transcript
 * snaps instead of erasing back through filler.
 */
export function ringStep(current: string, source: string, snapText: string): RingEdit {
  if (current === source || current === snapText) return { kind: "done" };
  if (source.startsWith(current)) {
    const rest = source.slice(current.length);
    return rest ? { kind: "type", text: rest } : { kind: "done" };
  }
  if (current.length >= 3) {
    const idx = source.lastIndexOf(current);
    if (idx >= 0) {
      const rest = source.slice(idx + current.length);
      return rest ? { kind: "type", text: rest } : { kind: "done" };
    }
  }
  return { kind: "snap", text: snapText };
}

export function ringContentFor(mode: RingMode, liveText: string): RingContent {
  if (mode === "wake" && liveText) {
    return { text: liveText, voice: "serif" };
  }
  if (mode === "think" || mode === "search" || mode === "speak") {
    return { text: liveText, voice: "serif" };
  }
  return { text: liveText, voice: "sans" };
}
