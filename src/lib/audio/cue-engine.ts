"use client";

// Procedural audio cues for ARIA's state machine. All tones are generated with
// the WebAudio API — no asset files. Cues are intentionally short, quiet, and
// musical so they don't compete with the conversation in the room.

type Note = {
  freq: number;
  durationMs: number;
  gain?: number;
  startOffsetMs?: number;
};

const PULSE_INTERVAL_MS = 1200;

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
    // Bright two-note ascending: E5 -> A5.
    this.playSequence([
      { freq: 659.25, durationMs: 80, gain: 0.18 },
      { freq: 880.0, durationMs: 110, gain: 0.18, startOffsetMs: 70 },
    ]);
  }

  playFollowUp() {
    // Single soft tone, half the wake energy.
    this.playSequence([{ freq: 659.25, durationMs: 110, gain: 0.08 }]);
  }

  playError() {
    // Descending two-note: A4 -> D4.
    this.playSequence([
      { freq: 440.0, durationMs: 130, gain: 0.15 },
      { freq: 293.66, durationMs: 150, gain: 0.15, startOffsetMs: 120 },
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
    // Low quiet sine — easy to ignore but enough to confirm "still working".
    this.playSequence([{ freq: 220.0, durationMs: 180, gain: 0.45 }]);
  }

  private playSequence(notes: Note[]) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    for (const note of notes) {
      const startAt = now + (note.startOffsetMs ?? 0) / 1000;
      const dur = note.durationMs / 1000;
      const peak = note.gain ?? 0.1;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = note.freq;

      const gain = ctx.createGain();
      // Short attack + release envelope to avoid clicks.
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(peak, startAt + 0.008);
      gain.gain.setValueAtTime(peak, startAt + Math.max(0.01, dur - 0.05));
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);

      osc.connect(gain).connect(this.master);
      osc.start(startAt);
      osc.stop(startAt + dur + 0.02);
    }
  }
}
