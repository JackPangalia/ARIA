"use client";

import { joinText } from "@/lib/text/join-text";
import type { TranscriptUtterance } from "@/lib/types";

export interface AssembledTranscriptTurn {
  utterance: TranscriptUtterance;
  sourceUtteranceIds: string[];
}

const MAX_CONTIGUOUS_GAP_SECONDS = 3;

function speakerKey(utterance: TranscriptUtterance): string {
  return utterance.providerSpeakerLabel ?? `speaker:${utterance.speaker}`;
}

export class TranscriptTurnAssembler {
  private current: AssembledTranscriptTurn | null = null;

  append(utterance: TranscriptUtterance): AssembledTranscriptTurn | null {
    if (!utterance.isFinal || !utterance.text.trim()) return null;

    const next: AssembledTranscriptTurn = {
      utterance: { ...utterance, text: utterance.text.trim() },
      sourceUtteranceIds: [utterance.id],
    };

    if (!this.current) {
      this.current = next;
      return null;
    }

    const sameSpeaker =
      speakerKey(this.current.utterance) === speakerKey(utterance);
    const gap = Math.max(0, utterance.start - this.current.utterance.end);
    if (sameSpeaker && gap <= MAX_CONTIGUOUS_GAP_SECONDS) {
      this.current = {
        utterance: {
          ...this.current.utterance,
          id: `${this.current.utterance.id}+${utterance.id}`,
          text: joinText(this.current.utterance.text, utterance.text),
          end: Math.max(this.current.utterance.end, utterance.end),
          isFinal: true,
          speechFinal: true,
        },
        sourceUtteranceIds: [
          ...this.current.sourceUtteranceIds,
          utterance.id,
        ],
      };
      return null;
    }

    const flushed = this.current;
    this.current = next;
    return flushed;
  }

  flush(): AssembledTranscriptTurn | null {
    const flushed = this.current;
    this.current = null;
    return flushed;
  }
}
