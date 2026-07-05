"use client";

// Procedural audio cues for Kivo's state machine. All tones are generated with
// the WebAudio API — no asset files. Cues are intentionally short, quiet, and
// musical so they don't compete with the conversation in the room.

type Note = {
  freq: number;
  durationMs: number;
  gain?: number;
  startOffsetMs?: number;
  /** Fade-in time (ms). Longer = softer, airier onset. */
  attackMs?: number;
  /** Fade-out time (ms). Longer = gentler, more bell-like tail. */
  releaseMs?: number;
  /** Cents of detune — a small amount adds a warm shimmer. */
  detuneCents?: number;
  type?: OscillatorType;
};

// Thinking pulse is a slow, faint breath rather than an insistent beep.
const PULSE_INTERVAL_MS = 2600;
// Answers that arrive quickly should play no thinking cue at all — silence
// reads as responsiveness. The pulse only starts once a think has gone on
// long enough that the user might wonder whether Kivo heard them.
const PULSE_START_DELAY_MS = 1500;

export class CueEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private pulseStartTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = true;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stopThinkingLoop();
  }

  setMasterVolume(v: number) {
    if (!this.master) return;
    this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  // Must be called from a user gesture (button click) so the AudioContext is
  // allowed to start. Subsequent calls are no-ops.
  async ensureReady() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
  }

  // Play an encoded audio clip (e.g. an MP3 answer) through the already-unlocked
  // context. On iOS this is the only reliable way to play TTS that arrives after
  // the initiating tap, because a fresh HTMLAudioElement would be gesture-blocked.
  // Returns a handle to stop playback early, or null if it could not start.
  async playClip(
    data: ArrayBuffer,
    handlers: {
      onPlay?: () => void;
      onEnded?: () => void;
      onError?: (err: unknown) => void;
    } = {}
  ): Promise<{ stop: () => void } | null> {
    try {
      await this.ensureReady();
      if (!this.ctx || !this.master) return null;
      const ctx = this.ctx;
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          // ignore — start() below will still surface a real failure
        }
      }
      // decodeAudioData detaches the buffer; the caller does not reuse it.
      const audioBuffer = await ctx.decodeAudioData(data);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.master);
      let ended = false;
      const finish = () => {
        if (ended) return;
        ended = true;
        handlers.onEnded?.();
      };
      source.onended = finish;
      source.start();
      handlers.onPlay?.();
      return {
        stop: () => {
          source.onended = null;
          try {
            source.stop();
          } catch {
            // already stopped
          }
          try {
            source.disconnect();
          } catch {
            // ignore
          }
        },
      };
    } catch (err) {
      handlers.onError?.(err);
      return null;
    }
  }

  async dispose() {
    this.stopThinkingLoop();
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        // ignore
      }
      this.ctx = null;
      this.master = null;
    }
  }

  // The cue set is deliberately minimal and understated — one short, quiet
  // acknowledgment where state genuinely needs confirming, silence everywhere
  // the conversation itself already carries the signal. Multi-note chimes read
  // as gimmicky next to a natural back-and-forth.

  playWake() {
    // A single soft tick — "I'm listening" — quiet and over in under 200ms so
    // it never competes with the speaker, who is usually still mid-sentence.
    this.playSequence([
      { freq: 830.61, durationMs: 170, gain: 0.06, attackMs: 12, releaseMs: 140 },
    ]);
  }

  playFollowUp() {
    // Intentionally silent. This fires after every single answer, and a chime
    // here is the biggest source of "talking to a gadget" feel. The answer
    // ending is itself the signal that Kivo is still listening; the UI shows
    // the follow-up state for anyone looking.
  }

  playClose() {
    // One low, warm note — a quiet "goodbye" without a melody.
    this.playSequence([
      { freq: 392.0, durationMs: 300, gain: 0.06, attackMs: 20, releaseMs: 250 },
    ]);
  }

  playError() {
    // Short low descending pair — clearly "that didn't work", kept brief.
    this.playSequence([
      { freq: 440.0, durationMs: 220, gain: 0.08, attackMs: 20, releaseMs: 180, type: "triangle" },
      { freq: 349.23, durationMs: 260, gain: 0.08, startOffsetMs: 120, attackMs: 24, releaseMs: 220, type: "triangle" },
    ]);
  }

  startThinkingLoop() {
    if (!this.enabled) return;
    this.stopThinkingLoop();
    // Stay silent at first — most answers start speaking before the delay
    // elapses and never need a cue. Only a long think gets the pulse.
    this.pulseStartTimer = setTimeout(() => {
      this.pulseStartTimer = null;
      this.playPulse();
      this.pulseTimer = setInterval(() => this.playPulse(), PULSE_INTERVAL_MS);
    }, PULSE_START_DELAY_MS);
  }

  stopThinkingLoop() {
    if (this.pulseStartTimer) {
      clearTimeout(this.pulseStartTimer);
      this.pulseStartTimer = null;
    }
    if (!this.pulseTimer) return;
    clearInterval(this.pulseTimer);
    this.pulseTimer = null;
  }

  private playPulse() {
    // A faint, slow low-fifth breath (A2 + E3) — present enough to confirm
    // "still working" but easy to talk over.
    this.playSequence([
      { freq: 110.0, durationMs: 900, gain: 0.05, attackMs: 180, releaseMs: 600 },
      { freq: 164.81, durationMs: 820, gain: 0.03, attackMs: 200, releaseMs: 560 },
    ]);
  }

  private playSequence(notes: Note[]) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    for (const note of notes) {
      const startAt = now + (note.startOffsetMs ?? 0) / 1000;
      const dur = note.durationMs / 1000;
      const peak = note.gain ?? 0.1;
      const attack = Math.min((note.attackMs ?? 8) / 1000, dur * 0.5);
      const release = Math.min((note.releaseMs ?? 50) / 1000, dur);

      const osc = ctx.createOscillator();
      osc.type = note.type ?? "sine";
      osc.frequency.value = note.freq;
      if (note.detuneCents) osc.detune.value = note.detuneCents;

      const gain = ctx.createGain();
      // Soft attack, sustain, long exponential release for a calm bloom.
      const holdUntil = Math.max(startAt + attack, startAt + dur - release);
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(peak, startAt + attack);
      gain.gain.setValueAtTime(peak, holdUntil);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);

      osc.connect(gain).connect(this.master);
      osc.start(startAt);
      osc.stop(startAt + dur + 0.02);
    }
  }
}
