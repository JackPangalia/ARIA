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

export class CueEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
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

  playWake() {
    // Soft ascending major triad (E–G#–B) that swells in — an airy, welcoming
    // shimmer rather than a bright beep. Long releases let the notes bloom.
    this.playSequence([
      { freq: 659.25, durationMs: 520, gain: 0.1, attackMs: 45, releaseMs: 380, detuneCents: 4 },
      { freq: 830.61, durationMs: 520, gain: 0.09, startOffsetMs: 90, attackMs: 55, releaseMs: 400, detuneCents: -4 },
      { freq: 987.77, durationMs: 560, gain: 0.085, startOffsetMs: 180, attackMs: 70, releaseMs: 460, detuneCents: 5 },
      // Faint octave halo above for sparkle.
      { freq: 1318.51, durationMs: 480, gain: 0.028, startOffsetMs: 200, attackMs: 90, releaseMs: 420 },
    ]);
  }

  playFollowUp() {
    // Single warm bell — a soft fundamental with a quiet octave partial.
    this.playSequence([
      { freq: 659.25, durationMs: 480, gain: 0.075, attackMs: 35, releaseMs: 400 },
      { freq: 1318.51, durationMs: 360, gain: 0.018, attackMs: 50, releaseMs: 300 },
    ]);
  }

  playClose() {
    // Gentle descending chime (B–E) — a calm, resolved sign-off.
    this.playSequence([
      { freq: 987.77, durationMs: 460, gain: 0.085, attackMs: 40, releaseMs: 360, detuneCents: 3 },
      { freq: 659.25, durationMs: 620, gain: 0.09, startOffsetMs: 150, attackMs: 50, releaseMs: 520, detuneCents: -3 },
      { freq: 1318.51, durationMs: 420, gain: 0.022, startOffsetMs: 160, attackMs: 70, releaseMs: 360 },
    ]);
  }

  playError() {
    // Soft descending minor third (A4 -> F4) — a gentle "didn't catch that"
    // rather than a harsh buzz.
    this.playSequence([
      { freq: 440.0, durationMs: 320, gain: 0.1, attackMs: 25, releaseMs: 260, type: "triangle" },
      { freq: 349.23, durationMs: 380, gain: 0.1, startOffsetMs: 160, attackMs: 30, releaseMs: 320, type: "triangle" },
    ]);
  }

  startThinkingLoop() {
    if (!this.enabled) return;
    this.stopThinkingLoop();
    // Fire one immediately so the user gets feedback right away, then continue
    // on an interval until something else takes over.
    this.playPulse();
    this.pulseTimer = setInterval(() => this.playPulse(), PULSE_INTERVAL_MS);
  }

  stopThinkingLoop() {
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
