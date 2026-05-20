"use client";

import type { TranscriptUtterance } from "@/lib/types";

interface AssemblyAIWord {
  text: string;
  start: number;
  end: number;
  speaker?: string;
  word_is_final?: boolean;
}

interface AssemblyAITurnMessage {
  type: "Turn";
  transcript?: string;
  speaker_label?: string;
  end_of_turn?: boolean;
  turn_is_formatted?: boolean;
  words?: AssemblyAIWord[];
}

type AssemblyAIMessage =
  | AssemblyAITurnMessage
  | { type: string; [key: string]: unknown };

export interface AssemblyAIClientCallbacks {
  onUtterance: (u: TranscriptUtterance) => void;
  onUtteranceEnd: () => void;
  onError: (err: Error) => void;
  onOpen: () => void;
  onClose: () => void;
}

export class AssemblyAILiveClient {
  private ws: WebSocket | null = null;
  private turnCounter = 0;
  private readonly speakerLabelToId = new Map<string, number>();
  private nextSpeakerId = 0;

  constructor(private callbacks: AssemblyAIClientCallbacks) {}

  async connect(): Promise<void> {
    const tokenRes = await fetch("/api/assemblyai/token", { method: "POST" });
    if (!tokenRes.ok) {
      throw new Error("Failed to get AssemblyAI token");
    }
    const { token } = (await tokenRes.json()) as { token: string };

    const params = new URLSearchParams({
      token,
      speech_model: "u3-rt-pro",
      sample_rate: "16000",
      speaker_labels: "true",
      keyterms_prompt: JSON.stringify(["ARIA", "Hey ARIA", "Hey Arya"]),
    });

    const url = `wss://streaming.assemblyai.com/v3/ws?${params.toString()}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      this.callbacks.onOpen();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as AssemblyAIMessage;
        this.handleMessage(msg);
      } catch (err) {
        this.callbacks.onError(
          err instanceof Error ? err : new Error("AssemblyAI parse error")
        );
      }
    };

    ws.onerror = () => {
      this.callbacks.onError(
        new Error(
          "AssemblyAI WebSocket error. Check that the temporary token is valid and streaming parameters are accepted."
        )
      );
    };

    ws.onclose = () => {
      this.callbacks.onClose();
    };
  }

  private resolveSpeakerId(label: string | undefined): number {
    const key = label?.trim() ? label : "UNKNOWN";
    const existing = this.speakerLabelToId.get(key);
    if (existing !== undefined) return existing;
    const id = this.nextSpeakerId++;
    this.speakerLabelToId.set(key, id);
    return id;
  }

  private wordSpeakerId(
    word: AssemblyAIWord,
    turnSpeakerLabel: string | undefined
  ): number {
    const label =
      word.speaker !== undefined && word.speaker !== null
        ? word.speaker
        : turnSpeakerLabel;
    return this.resolveSpeakerId(label);
  }

  private handleMessage(msg: AssemblyAIMessage) {
    if (msg.type !== "Turn") return;

    const turn = msg as AssemblyAITurnMessage;
    const turnSpeakerLabel = turn.speaker_label;
    const endOfTurn = turn.end_of_turn === true;
    const isFinal = endOfTurn;
    const speechFinal = endOfTurn;

    const turnId = this.turnCounter;
    if (endOfTurn) this.turnCounter++;

    const finalWords = (turn.words ?? []).filter((w) => w.word_is_final === true);
    const groups: Array<{ speaker: number; words: AssemblyAIWord[] }> = [];

    if (finalWords.length > 0) {
      for (const w of finalWords) {
        const speaker = this.wordSpeakerId(w, turnSpeakerLabel);
        const last = groups[groups.length - 1];
        if (last && last.speaker === speaker) {
          last.words.push(w);
        } else {
          groups.push({ speaker, words: [w] });
        }
      }
    } else if (turn.transcript?.trim()) {
      groups.push({
        speaker: this.resolveSpeakerId(turnSpeakerLabel),
        words: [],
      });
    }

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!;
      let text: string;
      let startSec: number;
      let endSec: number;

      if (g.words.length > 0) {
        const firstWord = g.words[0]!;
        const lastWord = g.words[g.words.length - 1]!;
        text = g.words.map((w) => w.text).join(" ");
        startSec = firstWord.start / 1000;
        endSec = lastWord.end / 1000;
      } else {
        text = turn.transcript?.trim() ?? "";
        if (!text) continue;
        startSec = turnId;
        endSec = turnId;
      }

      const utterance: TranscriptUtterance = {
        id: `${turnId}-${i}`,
        speaker: g.speaker,
        text,
        start: startSec,
        end: endSec,
        isFinal,
        speechFinal,
      };
      this.callbacks.onUtterance(utterance);
    }

    if (endOfTurn) {
      this.callbacks.onUtteranceEnd();
    }
  }

  sendPcm(pcm: Int16Array) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(pcm.buffer);
    }
  }

  close() {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "Terminate" }));
        }
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.turnCounter = 0;
    this.speakerLabelToId.clear();
    this.nextSpeakerId = 0;
  }
}
