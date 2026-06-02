// Server-side audio cues for the meeting-bot. The browser plays its in-person
// cues out the local speakers; the bot has none of that, so we play cues INTO the
// call via Recall's Output Audio endpoint (which only accepts base64 MP3).
//
// IMPORTANT: a meeting call (Zoom/Meet) runs every injected stream through
// aggressive noise suppression + AGC tuned for *speech*. Synthetic tones don't
// look like speech to that pipeline, so it ducks them to near-silence no matter
// how hot we encode them — which is why the earlier tone-only cues sounded faint
// and muffled in-call even though the MP3 itself was at full scale.
//
// `wake` and `error` use short spoken phrases through Cartesia (same voice as
// answers) so Meet/Zoom pass them at full speech loudness. The rapid `thinking`
// loop uses one cached non-lexical vocal pulse (default "Mmm.") — still speech
// to the codec, but not a sentence, so it can repeat every 1.2s without Kivo
// talking over himself. Without Cartesia, thinking falls back to a saturated tone.
//
// Phrases: RECALL_CUE_WAKE_PHRASE, RECALL_CUE_ERROR_PHRASE,
// RECALL_CUE_THINKING_PHRASE (hum pulse, not a full sentence).

import {
  createCartesiaSpeechStream,
  type CartesiaTtsConfig,
} from "@/lib/audio/cartesia-tts";
import { mp3DurationMs } from "./mp3-duration";

// lamejs ships an ESM build with named exports, but its CJS entry (which tsx's
// interop resolves for a static import) does not expose the constructors. A
// dynamic import forces the ESM build, so we load it lazily and cache it.
type Mp3EncoderCtor = new (
  channels: number,
  sampleRate: number,
  bitrateKbps: number
) => {
  encodeBuffer(buf: Int16Array): Uint8Array;
  flush(): Uint8Array;
};

let Mp3EncoderPromise: Promise<Mp3EncoderCtor> | null = null;
async function loadMp3Encoder(): Promise<Mp3EncoderCtor> {
  Mp3EncoderPromise ??= import("@breezystack/lamejs").then(
    (m) => m.Mp3Encoder as unknown as Mp3EncoderCtor
  );
  return Mp3EncoderPromise;
}

const SAMPLE_RATE = 44100;
const BITRATE_KBPS = 128;
/** Final true-peak ceiling after saturation. */
const TARGET_PEAK = 0.97;
/**
 * Perceived loudness lives in RMS, not peak. Kivo's *voice* sounds loud because
 * speech is dense broadband energy; a clean tone at the same peak is far quieter.
 * To match the voice we drive the cue into a soft saturator (tanh), which fattens
 * it toward a near-square wave — raising RMS close to the peak so it lands at
 * speech-level loudness. Higher = louder/buzzier. Tune live via RECALL_CUE_DRIVE.
 */
const SATURATION_DRIVE = (() => {
  const v = Number(process.env.RECALL_CUE_DRIVE);
  return Number.isFinite(v) && v > 0 ? v : 6;
})();
/** Interval between "still thinking" pulses. */
export const THINKING_PULSE_INTERVAL_MS = 1200;

interface Note {
  freq: number;
  durationMs: number;
  gain?: number;
  startOffsetMs?: number;
}

// A full harmonic stack (fundamental + overtones), like a struck bell or a vowel.
// Spreading energy across the speech band — instead of one pure pitch — is what
// makes the cue read as "voice-like" so the call's speech-tuned AGC/noise
// suppression passes it through at full level instead of ducking it as noise.
const HARMONICS: { mult: number; gain: number }[] = [
  { mult: 1, gain: 1 },
  { mult: 2, gain: 0.7 },
  { mult: 3, gain: 0.5 },
  { mult: 4, gain: 0.35 },
  { mult: 5, gain: 0.22 },
  { mult: 6, gain: 0.14 },
];

// Reworked for call playback: speech-band frequencies, longer (so the platform's
// fade-in ramp doesn't eat a short blip), saturated to speech-level loudness.
const CUE_NOTES: Record<"wake" | "thinking" | "error", Note[]> = {
  // Bright rising two-note chime: G5 -> D6. Reads as "I'm listening".
  wake: [
    { freq: 783.99, durationMs: 240, gain: 0.7 },
    { freq: 1174.66, durationMs: 320, gain: 0.8, startOffsetMs: 200 },
  ],
  // Single mid-band tone (D5), pulses every THINKING_PULSE_INTERVAL_MS while the
  // answer is generated. Long enough to clear the call's fade-in and be obvious.
  thinking: [{ freq: 587.33, durationMs: 340, gain: 0.7 }],
  // Descending two-note: Eb5 -> Ab4. Unmistakably "something went wrong".
  error: [
    { freq: 622.25, durationMs: 260, gain: 0.7 },
    { freq: 415.3, durationMs: 340, gain: 0.7, startOffsetMs: 240 },
  ],
};

/** Playback length (ms) used to serialize cues before the next clip. */
export const CUE_PLAYBACK_MS: Record<keyof typeof CUE_NOTES, number> = {
  wake: 560,
  thinking: 360,
  error: 600,
};

/** Render a sequence of saturated harmonic notes (click-free) into mono PCM16. */
function renderNotes(notes: Note[]): Int16Array {
  const totalMs = Math.max(
    ...notes.map((n) => (n.startOffsetMs ?? 0) + n.durationMs)
  );
  const totalSamples = Math.ceil((totalMs / 1000) * SAMPLE_RATE) + 64;
  const buf = new Float32Array(totalSamples);

  for (const note of notes) {
    const startAt = Math.floor(((note.startOffsetMs ?? 0) / 1000) * SAMPLE_RATE);
    const dur = note.durationMs / 1000;
    const durSamples = Math.floor(dur * SAMPLE_RATE);
    const peak = note.gain ?? 0.1;
    // 8ms attack / ~60ms release envelope to avoid clicks. A fast attack lets the
    // cue punch through before the call's AGC has time to clamp it down.
    const attack = Math.floor(0.008 * SAMPLE_RATE);
    const releaseStart = Math.max(attack, durSamples - Math.floor(0.06 * SAMPLE_RATE));

    for (let i = 0; i < durSamples; i++) {
      let env: number;
      if (i < attack) env = i / attack;
      else if (i < releaseStart) env = 1;
      else {
        const t = (i - releaseStart) / Math.max(1, durSamples - releaseStart);
        env = Math.max(0, 1 - t);
      }
      let osc = 0;
      for (const h of HARMONICS) {
        osc += Math.sin((2 * Math.PI * note.freq * h.mult * i) / SAMPLE_RATE) * h.gain;
      }
      const idx = startAt + i;
      if (idx < buf.length) buf[idx] += osc * peak * env;
    }
  }

  // Soft-saturate (tanh) to push RMS up near the peak — this is what makes the cue
  // as *loud* as the voice, not just as high-peaking. tanh keeps it click-free.
  let peakAbs = 0;
  for (let i = 0; i < buf.length; i++) {
    const driven = Math.tanh(buf[i]! * SATURATION_DRIVE);
    buf[i] = driven;
    peakAbs = Math.max(peakAbs, Math.abs(driven));
  }

  // Normalize the saturated signal to the true-peak ceiling.
  if (peakAbs > 0) {
    const scale = TARGET_PEAK / peakAbs;
    for (let i = 0; i < buf.length; i++) buf[i]! *= scale;
  }

  const pcm = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const clamped = Math.max(-1, Math.min(1, buf[i]!));
    pcm[i] = Math.round(clamped * 32767);
  }
  return pcm;
}

async function encodeMp3Base64(pcm: Int16Array): Promise<string> {
  const Mp3Encoder = await loadMp3Encoder();
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, BITRATE_KBPS);
  const chunks: Buffer[] = [];
  const BLOCK = 1152; // MP3 frame size
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const slice = pcm.subarray(i, i + BLOCK);
    const encoded = encoder.encodeBuffer(slice);
    if (encoded.length > 0) chunks.push(Buffer.from(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks).toString("base64");
}

type CueKind = "wake" | "thinking" | "error";

/** A ready-to-play cue: base64 MP3 plus how long it actually runs. */
export interface Cue {
  b64: string;
  playbackMs: number;
}

const WAKE_PHRASE = process.env.RECALL_CUE_WAKE_PHRASE ?? "Mm-hm?";
const ERROR_PHRASE =
  process.env.RECALL_CUE_ERROR_PHRASE ?? "Sorry, something went wrong.";
/** Short hum rendered once and looped while the answer generates. */
const THINKING_PULSE_PHRASE = process.env.RECALL_CUE_THINKING_PHRASE ?? "Mmm.";

const CUE_CACHE_VERSION = `pulse-v5-d${SATURATION_DRIVE}`;
const cache = new Map<string, Cue>();
// Cartesia config for the spoken cues. Set via warmCues() at worker startup.
let voiceConfig: CartesiaTtsConfig | null = null;

async function collectStream(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Synthesize a spoken cue through the same voice as Kivo's answers. */
async function renderVoiceCue(phrase: string): Promise<Cue> {
  if (!voiceConfig) throw new Error("voice cue requested before configured");
  const stream = await createCartesiaSpeechStream(voiceConfig, phrase);
  const mp3 = await collectStream(stream);
  return {
    b64: Buffer.from(mp3).toString("base64"),
    playbackMs: mp3DurationMs(mp3),
  };
}

/** Synthesize a tone cue (used for the rapid "thinking" pulse). */
async function renderToneCue(kind: CueKind): Promise<Cue> {
  const pcm = renderNotes(CUE_NOTES[kind]);
  return {
    b64: await encodeMp3Base64(pcm),
    playbackMs: CUE_PLAYBACK_MS[kind],
  };
}

async function buildThinkingPulseCue(): Promise<Cue> {
  if (voiceConfig) {
    try {
      return await renderVoiceCue(THINKING_PULSE_PHRASE);
    } catch (err) {
      console.error("[worker] thinking pulse voice failed; using tone:", err);
    }
  }
  return renderToneCue("thinking");
}

async function buildCue(kind: CueKind): Promise<Cue> {
  if (kind === "thinking") return buildThinkingPulseCue();

  const phrase = kind === "wake" ? WAKE_PHRASE : ERROR_PHRASE;
  if (voiceConfig) {
    try {
      return await renderVoiceCue(phrase);
    } catch (err) {
      console.error(`[worker] voice cue "${kind}" failed; using tone:`, err);
    }
  }
  return renderToneCue(kind);
}

/**
 * Pre-build all cues. Call once at worker startup (with the Cartesia voice config)
 * so the first wake word doesn't pay the synth/encode cost mid-conversation.
 */
export async function warmCues(config?: CartesiaTtsConfig): Promise<void> {
  if (config) voiceConfig = config;
  await Promise.all((["wake", "thinking", "error"] as CueKind[]).map(getCue));
}

export async function getCue(kind: CueKind): Promise<Cue> {
  const cacheKey =
    kind === "thinking"
      ? `${CUE_CACHE_VERSION}:thinking:${THINKING_PULSE_PHRASE}`
      : `${CUE_CACHE_VERSION}:${kind}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const cue = await buildCue(kind);
  cache.set(cacheKey, cue);
  return cue;
}
