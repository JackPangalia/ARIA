// Normalizes Recall.ai real-time websocket messages into a transport-neutral
// shape the worker turns into TranscriptUtterance. Recall's exact payload
// differs across API/provider versions, so parsing is defensive and isolated
// here — confirm field paths against the live "Real-Time WebSocket Endpoints"
// reference and adjust only this file if they differ.

export interface NormalizedTranscript {
  /** Stable participant identifier from the meeting roster. */
  participantId: string;
  /** Display name from the roster, if known. */
  participantName: string | null;
  text: string;
  /** Seconds from meeting start, best-effort. */
  start: number;
  end: number;
  /** transcript.data → final; transcript.partial_data → interim. */
  isFinal: boolean;
  /** Bot id, present in Recall event metadata. */
  botId: string | null;
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" ? (value as AnyRecord) : null;
}

function joinWords(words: unknown): string {
  if (!Array.isArray(words)) return "";
  return words
    .map((w) => {
      const rec = asRecord(w);
      return rec && typeof rec.text === "string" ? rec.text : "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNumber(...values: unknown[]): number {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

/**
 * Recall word timestamps look like `{ relative: 1.23, absolute: "..." }`.
 * Pull the relative seconds out of a word's start/end timestamp field.
 */
function wordTimestamp(word: unknown, key: "start_timestamp" | "end_timestamp"): number {
  const ts = asRecord(asRecord(word)?.[key]);
  return firstNumber(ts?.relative);
}

/**
 * Parse a single Recall real-time message. Returns null for non-transcript
 * events (participant join/leave, speech, etc.) or anything we can't read.
 */
export function parseRecallRealtimeMessage(
  raw: unknown
): NormalizedTranscript | null {
  const root = asRecord(raw);
  if (!root) return null;

  const event = typeof root.event === "string" ? root.event : "";
  const isFinal = event === "transcript.data";
  const isPartial = event === "transcript.partial_data";
  if (!isFinal && !isPartial) return null;

  // Common envelope: { event, data: { data: { words, participant }, bot } }
  const data = asRecord(root.data);
  const inner = asRecord(data?.data) ?? data;
  if (!inner) return null;

  const participant = asRecord(inner.participant);
  const participantId =
    (participant && (participant.id ?? participant.user_id)) ?? inner.speaker;
  if (participantId == null) return null;

  const participantName =
    participant && typeof participant.name === "string"
      ? participant.name
      : null;

  const words = inner.words ?? (asRecord(inner.transcript)?.words as unknown);
  const text =
    joinWords(words) ||
    (typeof inner.text === "string" ? inner.text.trim() : "");
  if (!text) return null;

  const botMeta = asRecord(data?.bot) ?? asRecord(root.bot);
  const botId =
    botMeta && typeof botMeta.id === "string" ? botMeta.id : null;

  // Recall carries timestamps per word as `{ relative: seconds }`. Fall back to
  // any top-level numeric fields for forward/backward compatibility.
  const wordList = Array.isArray(words) ? words : [];
  const firstWord = wordList[0];
  const lastWord = wordList[wordList.length - 1];
  const start =
    wordTimestamp(firstWord, "start_timestamp") ||
    firstNumber(inner.start_timestamp, inner.start);
  const end =
    wordTimestamp(lastWord, "end_timestamp") ||
    firstNumber(inner.end_timestamp, inner.end) ||
    start;

  return {
    participantId: String(participantId),
    participantName,
    text,
    start,
    end,
    isFinal,
    botId,
  };
}
