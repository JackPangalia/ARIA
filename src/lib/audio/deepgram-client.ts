"use client";

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
  duration?: number;
  // For UtteranceEnd events
  last_word_end?: number;
}

export interface DeepgramClientCallbacks {
  onUtterance: (u: TranscriptUtterance) => void;
  onUtteranceEnd: () => void;
  onError: (err: Error) => void;
  onOpen: () => void;
  onClose: () => void;
}

export class DeepgramLiveClient {
  private ws: WebSocket | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;

  constructor(private callbacks: DeepgramClientCallbacks) {}

  async connect(): Promise<void> {
    const tokenRes = await fetch("/api/deepgram/token", { method: "POST" });
    if (!tokenRes.ok) {
      throw new Error("Failed to get Deepgram token");
    }
    const { token } = (await tokenRes.json()) as { token: string };

    const params = new URLSearchParams({
      model: "nova-3",
      language: "en",
      smart_format: "true",
      diarize: "true",
      interim_results: "true",
      utterance_end_ms: "1000",
      vad_events: "true",
      encoding: "linear16",
      sample_rate: "16000",
      channels: "1",
    });
    params.append("keyterm", "ARIA");
    params.append("keyterm", "Hey ARIA");

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    const ws = new WebSocket(url, ["bearer", token]);
    this.ws = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      this.keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, 8000);
      this.callbacks.onOpen();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as DeepgramMessage;
        this.handleMessage(msg);
      } catch (err) {
        this.callbacks.onError(
          err instanceof Error ? err : new Error("DG parse error")
        );
      }
    };

    ws.onerror = () => {
      this.callbacks.onError(
        new Error(
          "Deepgram WebSocket error. Check that the temporary token is valid and the streaming connection parameters are accepted."
        )
      );
    };

    ws.onclose = () => {
      if (this.keepAlive) clearInterval(this.keepAlive);
      this.keepAlive = null;
      this.callbacks.onClose();
    };
  }

  private handleMessage(msg: DeepgramMessage) {
    if (msg.type === "UtteranceEnd") {
      this.callbacks.onUtteranceEnd();
      return;
    }

    if (msg.type && msg.type !== "Results") return;
    const alt = msg.channel?.alternatives?.[0];
    if (!alt || !Array.isArray(alt.words) || alt.words.length === 0) return;

    // Group consecutive words by speaker into one utterance per group.
    const groups: Array<{
      speaker: number;
      words: DeepgramWord[];
    }> = [];
    for (const w of alt.words) {
      const speaker = w.speaker ?? 0;
      const last = groups[groups.length - 1];
      if (last && last.speaker === speaker) {
        last.words.push(w);
      } else {
        groups.push({ speaker, words: [w] });
      }
    }

    const baseId = `${msg.start ?? 0}`;
    const isFinal = msg.is_final === true;

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const firstWord = g.words[0];
      const lastWord = g.words[g.words.length - 1];
      if (!firstWord || !lastWord) continue;

      const text = g.words
        .map((w) => w.punctuated_word ?? w.word)
        .join(" ");
      const utterance: TranscriptUtterance = {
        // Stable id per (start, group index). When DG sends a final for the
        // same start window, it overwrites the interim version.
        id: `${baseId}-${i}`,
        speaker: g.speaker,
        text,
        start: firstWord.start,
        end: lastWord.end,
        isFinal,
      };
      this.callbacks.onUtterance(utterance);
    }
  }

  // Send raw 16kHz mono int16 PCM audio.
  sendPcm(pcm: Int16Array) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(pcm.buffer);
    }
  }

  close() {
    if (this.keepAlive) {
      clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "CloseStream" }));
        }
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}
