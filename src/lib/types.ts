export type SpeakerId = number;

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  speaker: SpeakerId;
  confidence: number;
}

export type VoiceprintConfidence = "high" | "medium" | "low" | "none";

export interface TranscriptUtterance {
  id: string;
  speaker: SpeakerId;
  text: string;
  start: number;
  end: number;
  isFinal: boolean;
  speechFinal?: boolean;
  // Voiceprint-resolved speaker name (overrides Deepgram's speaker number
  // when present). `confidence` reflects how sure the embedding match was.
  assignedName?: string | null;
  nameConfidence?: VoiceprintConfidence;
}

export interface Voiceprint {
  name: string;
  // Mean L2-normalized embedding (256-dim for WeSpeaker). Stored as a plain
  // number array so it serializes cleanly to Firestore / JSON.
  centroid: number[];
  sampleCount: number;
}

export interface VoiceprintMatch {
  name: string | null;
  confidence: VoiceprintConfidence;
  similarity: number;
  runnerUp: number;
}

export type AriaStatus =
  | "idle"
  | "listening"
  | "wake-detected"
  | "capturing-question"
  | "thinking"
  | "speaking"
  | "follow-up-listening"
  | "error";

export type IntroductionMode = "off" | "solo" | "group";
