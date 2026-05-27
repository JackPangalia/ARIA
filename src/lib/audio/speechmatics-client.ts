"use client";

import type { SpeakerProfileDoc } from "@/lib/speakers/types";
import type { TranscriptUtterance } from "@/lib/types";

type SpeechmaticsTranscriptResult = {
  type: "word" | "punctuation" | "entity";
  start_time?: number;
  end_time?: number;
  alternatives?: Array<{
    content: string;
    confidence?: number;
    speaker?: string;
  }>;
};

type SpeechmaticsMessage =
  | {
      message: "RecognitionStarted";
    }
  | {
      message: "AddPartialTranscript" | "AddTranscript";
      metadata: {
        start_time: number;
        end_time: number;
        transcript: string;
      };
      results: SpeechmaticsTranscriptResult[];
    }
  | {
      message: "EndOfUtterance";
    }
  | {
      message: "SpeakersResult";
      speakers: Array<{
        label: string;
        speaker_identifiers: string[];
      }>;
    }
  | {
      message: "Error";
      type?: string;
      reason?: string;
    }
  | {
      message: string;
      [key: string]: unknown;
    };

type TranscriptMessage = {
  message: "AddPartialTranscript" | "AddTranscript";
  metadata: {
    start_time: number;
    end_time: number;
    transcript: string;
  };
  results: SpeechmaticsTranscriptResult[];
};

type SpeakersResultMessage = {
  message: "SpeakersResult";
  speakers: Array<{
    label: string;
    speaker_identifiers: string[];
  }>;
};

export interface SpeechmaticsSpeakerResult {
  label: string;
  speakerIdentifiers: string[];
}

export interface SpeechmaticsClientCallbacks {
  onUtterance: (u: TranscriptUtterance) => void;
  onUtteranceEnd: () => void;
  onSpeakersResult?: (speakers: SpeechmaticsSpeakerResult[]) => void;
  onError: (err: Error) => void;
  onOpen: () => void;
  onClose: () => void;
}

type SpeakerGroup = {
  providerSpeakerLabel: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
};

function safeSpeakerLabel(label: string): string {
  const clean = label.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!clean) return "Unknown speaker";
  // Speechmatics reserves labels like S1/S2 for internal generic speakers.
  return /^s\d+$/i.test(clean) ? `Speaker ${clean.slice(1)}` : clean;
}

function appendToken(current: string, token: string, type: string): string {
  if (!current) return token;
  if (type === "punctuation") return `${current}${token}`;
  return `${current} ${token}`;
}

export function groupSpeechmaticsResultsBySpeaker(
  results: SpeechmaticsTranscriptResult[]
): SpeakerGroup[] {
  const groups: SpeakerGroup[] = [];
  let current: SpeakerGroup | null = null;
  let lastSpeaker = "S1";

  for (const item of results) {
    const alt = item.alternatives?.[0];
    if (!alt?.content) continue;

    const speaker = alt.speaker ?? lastSpeaker;
    lastSpeaker = speaker;
    const start: number = item.start_time ?? current?.end ?? 0;
    const end: number = item.end_time ?? start;
    const confidence: number = alt.confidence ?? current?.confidence ?? 0;

    if (!current || current.providerSpeakerLabel !== speaker) {
      current = {
        providerSpeakerLabel: speaker,
        text: "",
        start,
        end,
        confidence,
      };
      groups.push(current);
    }

    current.text = appendToken(current.text, alt.content, item.type).trim();
    current.end = end;
    current.confidence = Math.max(current.confidence, confidence);
  }

  return groups.filter((group) => group.text.length > 0);
}

export class SpeechmaticsLiveClient {
  private ws: WebSocket | null = null;
  private seqNo = 0;
  private recognitionStarted = false;
  private audioQueue: ArrayBuffer[] = [];
  private speakerLabelToIndex = new Map<string, number>();
  private speakerLabelToName = new Map<string, string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByClient = false;

  constructor(
    private callbacks: SpeechmaticsClientCallbacks,
    private profiles: SpeakerProfileDoc[] = []
  ) {
    for (const profile of profiles) {
      this.speakerLabelToName.set(profile.name, profile.name);
    }
  }

  async connect(): Promise<void> {
    this.closedByClient = false;
    const { getSpeechmaticsToken } = await import("@/lib/speakers/client");
    const { token, region } = await getSpeechmaticsToken();
    const ws = new WebSocket(
      `wss://${region}.rt.speechmatics.com/v2?jwt=${encodeURIComponent(token)}`
    );
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.sendJson(this.buildStartRecognitionMessage());
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let msg: SpeechmaticsMessage;
      try {
        msg = JSON.parse(event.data) as SpeechmaticsMessage;
      } catch {
        return;
      }
      this.handleMessage(msg);
    });

    ws.addEventListener("error", () => {
      this.callbacks.onError(new Error("Speechmatics WebSocket error"));
    });

    ws.addEventListener("close", (event) => {
      this.recognitionStarted = false;
      this.ws = null;
      this.callbacks.onClose();
      if (this.closedByClient) return;
      if ([4005, 4013, 1011].includes(event.code)) {
        this.reconnectTimer = setTimeout(() => {
          void this.connect().catch((err) => this.callbacks.onError(err));
        }, 5000);
      }
    });
  }

  private buildStartRecognitionMessage() {
    return {
      message: "StartRecognition",
      audio_format: {
        type: "raw",
        encoding: "pcm_s16le",
        sample_rate: 16000,
      },
      transcription_config: {
        language: "en",
        diarization: "speaker",
        enable_partials: true,
        max_delay: 0.7,
        max_delay_mode: "fixed",
        additional_vocab: ["ARIA", "Arya", "Hey ARIA"],
        speaker_diarization_config: {
          max_speakers: 10,
          prefer_current_speaker: true,
          speakers: this.profiles.map((profile) => ({
            label: safeSpeakerLabel(profile.name),
            speaker_identifiers: profile.speakerIdentifiers,
          })),
        },
        conversation_config: {
          end_of_utterance_silence_trigger: 1.2,
        },
      },
    };
  }

  private handleMessage(msg: SpeechmaticsMessage) {
    if (msg.message === "RecognitionStarted") {
      this.recognitionStarted = true;
      this.callbacks.onOpen();
      this.flushAudioQueue();
      return;
    }

    if (msg.message === "AddPartialTranscript" || msg.message === "AddTranscript") {
      this.handleTranscript(msg as TranscriptMessage);
      return;
    }

    if (msg.message === "EndOfUtterance") {
      this.callbacks.onUtteranceEnd();
      return;
    }

    if (msg.message === "SpeakersResult") {
      const result = msg as SpeakersResultMessage;
      this.callbacks.onSpeakersResult?.(
        result.speakers.map((speaker) => ({
          label: speaker.label,
          speakerIdentifiers: speaker.speaker_identifiers,
        }))
      );
      return;
    }

    if (msg.message === "Error") {
      this.callbacks.onError(
        new Error(
          `Speechmatics error${msg.type ? ` (${msg.type})` : ""}: ${
            msg.reason ?? "unknown"
          }`
        )
      );
    }
  }

  private handleTranscript(
    msg: TranscriptMessage
  ) {
    const isFinal = msg.message === "AddTranscript";
    const speechFinal = isFinal;
    const groups = groupSpeechmaticsResultsBySpeaker(msg.results);
    const baseId = `${msg.metadata.start_time}-${isFinal ? "final" : "partial"}`;

    groups.forEach((group, index) => {
      const speaker = this.speakerIndexForLabel(group.providerSpeakerLabel);
      const speakerName =
        this.speakerLabelToName.get(group.providerSpeakerLabel) ??
        (/^s\d+$/i.test(group.providerSpeakerLabel)
          ? null
          : safeSpeakerLabel(group.providerSpeakerLabel));

      this.callbacks.onUtterance({
        id: `${baseId}-${index}`,
        speaker,
        speakerName,
        providerSpeakerLabel: group.providerSpeakerLabel,
        text: group.text,
        start: group.start,
        end: group.end,
        isFinal,
        speechFinal,
      });
    });
  }

  private speakerIndexForLabel(label: string): number {
    const generic = /^s(\d+)$/i.exec(label);
    if (generic) {
      return Math.max(0, Number(generic[1]) - 1);
    }

    const existing = this.speakerLabelToIndex.get(label);
    if (existing != null) return existing;
    const next = this.speakerLabelToIndex.size;
    this.speakerLabelToIndex.set(label, next);
    return next;
  }

  private sendJson(data: unknown) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(data));
  }

  private flushAudioQueue() {
    const pending = this.audioQueue;
    this.audioQueue = [];
    for (const frame of pending) {
      this.sendArrayBuffer(frame);
    }
  }

  private sendArrayBuffer(buffer: ArrayBuffer) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.recognitionStarted) {
      this.audioQueue.push(buffer);
      return;
    }
    if (ws.bufferedAmount > 2_000_000) return;
    this.seqNo += 1;
    ws.send(buffer);
  }

  sendPcm(pcm: Int16Array) {
    const bytes = new Uint8Array(pcm.byteLength);
    bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    this.sendArrayBuffer(bytes.buffer);
  }

  requestSpeakers(options: { final?: boolean } = {}) {
    this.sendJson({ message: "GetSpeakers", final: options.final ?? false });
  }

  close() {
    this.closedByClient = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    if (!ws) return;
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ message: "EndOfStream", last_seq_no: this.seqNo }));
      }
      ws.close();
    } catch {
      // ignore close failures
    } finally {
      this.ws = null;
      this.recognitionStarted = false;
      this.audioQueue = [];
    }
  }
}
