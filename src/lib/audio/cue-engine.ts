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

// The search cue sits high and moves faster than the low thinking breath, so a
// live lookup never sounds like a long think. It also waits longer before
// starting: Kivo speaks a short hand-off line as the search begins, and a chime
// layered under that line is just clutter.
const SEARCH_PULSE_INTERVAL_MS = 1500;
const SEARCH_PULSE_START_DELAY_MS = 2200;

export class CueEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private workTimer: ReturnType<typeof setInterval> | null = null;
  private workStartTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = true;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stopWorkCue();
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

  /** Sample rate of the unlocked playback context, once `ensureReady` has run. */
  get sampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  // The answer-playback path schedules raw PCM through this already-unlocked
  // context (a fresh AudioContext could start suspended outside a gesture).
  async getPlaybackContext(): Promise<{
    ctx: AudioContext;
    master: GainNode;
  } | null> {
    await this.ensureReady();
    if (!this.ctx || !this.master) return null;
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        // playback attempt below will surface a real failure
      }
    }
    return { ctx: this.ctx, master: this.master };
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
      /** If set, the clip is routed here instead of straight into master. */
      destination?: AudioNode;
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
      source.connect(handlers.destination ?? this.master);
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
    this.stopWorkCue();
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

  playSearch() {
    // Two soft, airy ascending tones — "Searching" signal — quiet and crisp (~220ms total).
    this.playSequence([
      { freq: 523.25, durationMs: 140, gain: 0.05, attackMs: 10, releaseMs: 100 },
      { freq: 659.25, durationMs: 180, gain: 0.05, startOffsetMs: 70, attackMs: 10, releaseMs: 130 },
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
    this.startWorkCue(
      () => this.playPulse(),
      PULSE_START_DELAY_MS,
      PULSE_INTERVAL_MS
    );
  }

  /**
   * Ambient cue while a web search runs. Kept audibly distinct from the
   * thinking breath: the room should be able to hear that Kivo is looking
   * something up rather than mulling it over.
   */
  startSearchingLoop() {
    this.startWorkCue(
      () => this.playSearchPulse(),
      SEARCH_PULSE_START_DELAY_MS,
      SEARCH_PULSE_INTERVAL_MS
    );
  }

  /**
   * Stops whichever ambient work cue is running. Thinking and searching share
   * one slot — they never overlap — so every teardown path can call this
   * without knowing which one started.
   */
  stopWorkCue() {
    if (this.workStartTimer) {
      clearTimeout(this.workStartTimer);
      this.workStartTimer = null;
    }
    if (!this.workTimer) return;
    clearInterval(this.workTimer);
    this.workTimer = null;
  }

  private startWorkCue(play: () => void, delayMs: number, intervalMs: number) {
    if (!this.enabled) return;
    this.stopWorkCue();
    // Stay silent at first — most answers start speaking before the delay
    // elapses and never need a cue. Only slow work gets the pulse.
    this.workStartTimer = setTimeout(() => {
      this.workStartTimer = null;
      play();
      this.workTimer = setInterval(play, intervalMs);
    }, delayMs);
  }

  private playSearchPulse() {
    // A faint high shimmer (A5 + E6) with a long, airy attack — reads as
    // "out looking for something", and can't be mistaken for the low breath.
    this.playSequence([
      { freq: 880.0, durationMs: 300, gain: 0.026, attackMs: 60, releaseMs: 230 },
      { freq: 1318.51, durationMs: 240, gain: 0.016, startOffsetMs: 110, attackMs: 60, releaseMs: 180 },
    ]);
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
