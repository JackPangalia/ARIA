export type SpeakerId = number;

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  speaker: SpeakerId;
  confidence: number;
}

export interface TranscriptUtterance {
  id: string;
  speaker: SpeakerId;
  text: string;
  start: number;
  end: number;
  isFinal: boolean;
}

export type AriaStatus =
  | "idle"
  | "listening"
  | "wake-detected"
  | "capturing-question"
  | "thinking"
  | "speaking"
  | "error";
