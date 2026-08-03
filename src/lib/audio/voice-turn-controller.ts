"use client";

export type VoiceTurnPhase =
  | "idle"
  | "listening"
  | "capturing"
  | "endpointing"
  | "generating"
  | "speaking"
  | "interrupting";

export interface VoiceTurnControllerCallbacks {
  onPhaseChange?: (phase: VoiceTurnPhase, previous: VoiceTurnPhase) => void;
  onInterrupt?: (from: "generating" | "speaking") => void;
}

/**
 * Single authority for the interruptible part of a voice turn. UI status still
 * lives in Zustand, but generation/playback transitions pass through here so a
 * late callback cannot revive a superseded answer.
 */
export class VoiceTurnController {
  private phase: VoiceTurnPhase = "idle";
  private generation = 0;

  constructor(private readonly callbacks: VoiceTurnControllerCallbacks = {}) {}

  get currentPhase(): VoiceTurnPhase {
    return this.phase;
  }

  get currentGeneration(): number {
    return this.generation;
  }

  transition(next: VoiceTurnPhase): void {
    if (next === this.phase) return;
    const previous = this.phase;
    this.phase = next;
    this.callbacks.onPhaseChange?.(next, previous);
  }

  beginGeneration(): number {
    this.generation += 1;
    this.transition("generating");
    return this.generation;
  }

  beginSpeaking(generation: number): boolean {
    if (!this.isCurrent(generation) || this.phase === "interrupting") return false;
    this.transition("speaking");
    return true;
  }

  finish(generation: number): boolean {
    if (!this.isCurrent(generation)) return false;
    this.transition("listening");
    return true;
  }

  interrupt(): boolean {
    if (this.phase !== "generating" && this.phase !== "speaking") return false;
    const from = this.phase;
    this.generation += 1;
    this.transition("interrupting");
    this.callbacks.onInterrupt?.(from);
    return true;
  }

  invalidate(next: VoiceTurnPhase = "listening"): number {
    this.generation += 1;
    this.transition(next);
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
}

