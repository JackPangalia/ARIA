"use client";

import type { Voiceprint, VoiceprintMatch } from "@/lib/types";

// Cosine similarity for unit-normalized vectors is just the dot product.
function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

function l2Normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i]! * vec[i]!;
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i]! / norm;
  return out;
}

// Tuned for unit-length speaker embeddings (WeSpeaker / pyannote family).
// These thresholds can be adjusted as we gather real-world data.
const HIGH_CONFIDENCE = 0.72;
const MEDIUM_CONFIDENCE = 0.55;
const MIN_MARGIN_OVER_RUNNER_UP = 0.04;

export class SpeakerIdentifier {
  // name -> running mean embedding + sample count
  private prints = new Map<string, { centroid: Float32Array; count: number }>();

  hasAny(): boolean {
    return this.prints.size > 0;
  }

  list(): Voiceprint[] {
    return Array.from(this.prints.entries()).map(([name, v]) => ({
      name,
      centroid: Array.from(v.centroid),
      sampleCount: v.count,
    }));
  }

  load(prints: Voiceprint[]): void {
    this.prints.clear();
    for (const p of prints) {
      if (!p?.name || !Array.isArray(p.centroid)) continue;
      this.prints.set(p.name, {
        centroid: l2Normalize(Float32Array.from(p.centroid)),
        count: Math.max(1, p.sampleCount ?? 1),
      });
    }
  }

  remove(name: string): boolean {
    return this.prints.delete(name);
  }

  rename(oldName: string, newName: string): boolean {
    const cur = this.prints.get(oldName);
    if (!cur) return false;
    if (this.prints.has(newName) && oldName !== newName) return false;
    this.prints.delete(oldName);
    this.prints.set(newName, cur);
    return true;
  }

  clear(): void {
    this.prints.clear();
  }

  // Add a new sample to a named voiceprint. Uses a running mean of normalized
  // embeddings so distant outliers don't dominate; result is re-normalized
  // so cosine-similarity comparisons stay calibrated.
  enroll(name: string, embedding: Float32Array): void {
    const normalized = l2Normalize(embedding);
    const existing = this.prints.get(name);
    if (!existing) {
      this.prints.set(name, { centroid: normalized, count: 1 });
      return;
    }
    const nextCount = existing.count + 1;
    const blended = new Float32Array(normalized.length);
    for (let i = 0; i < normalized.length; i++) {
      blended[i] =
        (existing.centroid[i]! * existing.count + normalized[i]!) / nextCount;
    }
    this.prints.set(name, {
      centroid: l2Normalize(blended),
      count: nextCount,
    });
  }

  // Identify a speaker for the given embedding.
  identify(embedding: Float32Array): VoiceprintMatch {
    if (this.prints.size === 0) {
      return { name: null, confidence: "none", similarity: 0, runnerUp: 0 };
    }
    const normalized = l2Normalize(embedding);

    let bestName: string | null = null;
    let bestSim = -Infinity;
    let secondSim = -Infinity;

    for (const [name, v] of this.prints) {
      const sim = cosine(normalized, v.centroid);
      if (sim > bestSim) {
        secondSim = bestSim;
        bestSim = sim;
        bestName = name;
      } else if (sim > secondSim) {
        secondSim = sim;
      }
    }

    if (secondSim === -Infinity) secondSim = 0;
    const margin = bestSim - secondSim;

    let confidence: VoiceprintMatch["confidence"] = "low";
    if (bestSim >= HIGH_CONFIDENCE && margin >= MIN_MARGIN_OVER_RUNNER_UP) {
      confidence = "high";
    } else if (bestSim >= MEDIUM_CONFIDENCE) {
      confidence = "medium";
    }

    return {
      name: confidence === "low" ? null : bestName,
      confidence,
      similarity: bestSim,
      runnerUp: secondSim,
    };
  }
}
