import { joinText } from "@/lib/text/join-text";
import type { TurnDoc, TurnRole } from "@/lib/sessions/types";
import type { TranscriptUtterance } from "@/lib/types";

const LIVE_MERGE_GAP_SECONDS = 3;

export interface TranscriptLine {
  id: string;
  role: TurnRole;
  text: string;
  speaker: number | null;
  speakerName: string | null;
  sourceUtteranceIds: string[];
  isPartial: boolean;
}

function labelForUtterance(utterance: TranscriptUtterance): string | null {
  return utterance.speakerName ?? `Speaker ${utterance.speaker + 1}`;
}

function speakerKey(utterance: TranscriptUtterance): string {
  return utterance.providerSpeakerLabel ?? `speaker:${utterance.speaker}`;
}

function turnToLine(turn: TurnDoc): TranscriptLine {
  return {
    id: turn.id,
    role: turn.role,
    text: turn.text,
    speaker: turn.speaker,
    speakerName: turn.speakerName,
    sourceUtteranceIds: turn.sourceUtteranceIds,
    isPartial: false,
  };
}

function liveGroups(utterances: TranscriptUtterance[]): TranscriptLine[] {
  const groups: Array<TranscriptLine & { end: number; speakerKey: string }> = [];
  const sorted = [...utterances].sort(
    (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id)
  );

  for (const utterance of sorted) {
    const text = utterance.text.trim();
    if (!text) continue;

    const key = speakerKey(utterance);
    const last = groups[groups.length - 1];
    const gap = last ? Math.max(0, utterance.start - last.end) : Infinity;

    if (last && last.speakerKey === key && gap <= LIVE_MERGE_GAP_SECONDS) {
      last.text = joinText(last.text, text);
      last.end = Math.max(last.end, utterance.end);
      last.sourceUtteranceIds.push(utterance.id);
      last.isPartial = last.isPartial || !utterance.isFinal;
      last.id = `live:${last.sourceUtteranceIds.join("+")}`;
      continue;
    }

    groups.push({
      id: `live:${utterance.id}`,
      role: "speaker",
      text,
      speaker: utterance.speaker,
      speakerName: labelForUtterance(utterance),
      sourceUtteranceIds: [utterance.id],
      isPartial: !utterance.isFinal,
      end: utterance.end,
      speakerKey: key,
    });
  }

  return groups.map((group) => ({
    id: group.id,
    role: group.role,
    text: group.text,
    speaker: group.speaker,
    speakerName: group.speakerName,
    sourceUtteranceIds: group.sourceUtteranceIds,
    isPartial: group.isPartial,
  }));
}

export function buildLiveTranscriptLines(input: {
  turns: TurnDoc[];
  utterances: TranscriptUtterance[];
}): TranscriptLine[] {
  const persistedSourceIds = new Set(
    input.turns.flatMap((turn) => turn.sourceUtteranceIds)
  );
  const liveTail = input.utterances.filter(
    (utterance) => !persistedSourceIds.has(utterance.id)
  );

  return [...input.turns.map(turnToLine), ...liveGroups(liveTail)];
}
