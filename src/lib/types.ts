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
  speakerName?: string | null;
  providerSpeakerLabel?: string | null;
  text: string;
  start: number;
  end: number;
  isFinal: boolean;
  speechFinal?: boolean;
  /**
   * True when this utterance's words were captured while Kivo's own TTS audio
   * was playing (± a small guard window), determined by comparing word
   * timestamps against known assistant-speech intervals on the audio-stream
   * timeline. Such utterances are Kivo's own voice echoing through the mic and
   * must never be treated as real speech (transcript, question capture) —
   * only scanned for stop/wake commands.
   */
  overlapsAssistantSpeech?: boolean;
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
