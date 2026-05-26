"use client";

import { DeepgramClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import type { TranscriptUtterance } from "@/lib/types";

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  speaker?: number;
  confidence: number;
  punctuated_word?: string;
}

interface DeepgramMessage {
  type?: string;
  channel?: {
    alternatives: Array<{
      transcript: string;
      words: DeepgramWord[];
    }>;
  };
  is_final?: boolean;
  speech_final?: boolean;
  start?: number;
}

export interface DeepgramClientCallbacks {
  onUtterance: (u: TranscriptUtterance) => void;
  onUtteranceEnd: () => void;
  onError: (err: Error) => void;
  onOpen: () => void;
  onClose: () => void;
}

type DeepgramConnection = {
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  send: (data: ArrayBuffer) => void;
  keepAlive: () => void;
  finish: () => void;
  requestClose: () => void;
};

/** Group words into contiguous speaker runs using Deepgram's native labels. */
export function groupWordsBySpeaker(words: DeepgramWord[]): Array<{
  speaker: number;
  words: DeepgramWord[];
}> {
  if (words.length === 0) return [];

  const groups: Array<{ speaker: number; words: DeepgramWord[] }> = [];
  for (const word of words) {
    const speaker = word.speaker ?? 0;
    const last = groups[groups.length - 1];
    if (last && last.speaker === speaker) {
      last.words.push(word);
    } else {
      groups.push({ speaker, words: [word] });
    }
  }
  return groups;
}

export class DeepgramLiveClient {
  private connection: DeepgramConnection | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;

  constructor(private callbacks: DeepgramClientCallbacks) {}

  async connect(): Promise<void> {
    const tokenRes = await fetch("/api/deepgram/token", { method: "POST" });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => "");
      throw new Error(`Failed to get Deepgram token: ${tokenRes.status} ${errText}`);
    }
    const { token } = (await tokenRes.json()) as { token: string };

    const client = new DeepgramClient({ accessToken: token });
    const connection = client.listen.live({
      model: "nova-3",
      language: "en-US",
      smart_format: true,
      diarize: true,
      interim_results: true,
      utterance_end_ms: 1200,
      endpointing: 400,
      vad_events: true,
      encoding: "linear16",
      sample_rate: 16000,
      channels: 1,
      keyterm: ["ARIA", "Hey ARIA"],
    });
    this.connection = connection as DeepgramConnection;

    connection.on(LiveTranscriptionEvents.Open, () => {
      this.keepAlive = setInterval(() => {
        this.connection?.keepAlive();
      }, 8000);
      this.callbacks.onOpen();
    });

    connection.on(LiveTranscriptionEvents.Transcript, (msg) => {
      this.handleMessage(msg as DeepgramMessage);
    });

    connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      this.callbacks.onUtteranceEnd();
    });

    connection.on(LiveTranscriptionEvents.Error, (err) => {
      this.callbacks.onError(
        err instanceof Error ? err : new Error("Deepgram WebSocket error")
      );
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      if (this.keepAlive) clearInterval(this.keepAlive);
      this.keepAlive = null;
      this.connection = null;
      this.callbacks.onClose();
    });
  }

  private handleMessage(msg: DeepgramMessage) {
    if (msg.type === "UtteranceEnd") {
      this.callbacks.onUtteranceEnd();
      return;
    }

    if (msg.type && msg.type !== "Results") return;

    const alt = msg.channel?.alternatives?.[0];
    if (!alt || !Array.isArray(alt.words) || alt.words.length === 0) return;

    const isFinal = msg.is_final === true;
    const speechFinal = msg.speech_final === true;
    const baseId = `${msg.start ?? 0}-${speechFinal ? "final" : "partial"}`;

    const groups = groupWordsBySpeaker(alt.words);

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!;
      const firstWord = group.words[0];
      const lastWord = group.words[group.words.length - 1];
      if (!firstWord || !lastWord) continue;

      const text = group.words
        .map((word) => word.punctuated_word ?? word.word)
        .join(" ")
        .trim();
      if (!text) continue;

      this.callbacks.onUtterance({
        id: `${baseId}-${i}`,
        speaker: group.speaker,
        text,
        start: firstWord.start,
        end: lastWord.end,
        isFinal,
        speechFinal,
      });
    }
  }

  sendPcm(pcm: Int16Array) {
    const bytes = new Uint8Array(pcm.byteLength);
    bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    this.connection?.send(bytes.buffer);
  }

  close() {
    if (this.keepAlive) {
      clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
    if (this.connection) {
      try {
        this.connection.finish();
        this.connection.requestClose();
      } catch {
        // ignore
      }
      this.connection = null;
    }
  }
}
