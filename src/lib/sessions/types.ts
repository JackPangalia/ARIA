import { z } from "zod";

export const SessionStatusSchema = z.enum(["active", "ended", "archived", "trashed"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const TurnRoleSchema = z.enum(["speaker", "user_question", "assistant"]);
export type TurnRole = z.infer<typeof TurnRoleSchema>;

export const SessionModeSchema = z.enum(["in_person", "bot"]);
export type SessionMode = z.infer<typeof SessionModeSchema>;

export function parseSessionMode(value: unknown): SessionMode {
  const parsed = SessionModeSchema.safeParse(value);
  return parsed.success ? parsed.data : "in_person";
}

export const TranscriptionModeSchema = z.enum(["basic", "speaker"]);
export type TranscriptionMode = z.infer<typeof TranscriptionModeSchema>;

export const MeetingPlatformSchema = z.enum(["zoom", "meet", "teams", "webex"]);
export type MeetingPlatform = z.infer<typeof MeetingPlatformSchema>;

export const BotStatusSchema = z.enum([
  "joining",
  "live",
  "ended",
  "error",
]);
export type BotStatus = z.infer<typeof BotStatusSchema>;

export interface SessionDoc {
  id: string;
  title: string;
  projectId: string | null;
  /** True when the title was set by auto-naming (can be upgraded after Q&A). */
  autoTitled: boolean;
  status: SessionStatus;
  speakerCount: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  trashedAt: string | null;
  lastSummaryAt: string | null;
  tokenEstimate: number;
  searchableTextPreview: string;
  turnCount: number;
  /** "in_person" (default) or dormant "bot". */
  mode: SessionMode;
  /** "basic" skips speaker ID; "speaker" keeps diarization and profiles. */
  transcriptionMode: TranscriptionMode;
  /** Recall bot id when a meeting bot is/was attached, else null. */
  botId: string | null;
  meetingPlatform: MeetingPlatform | null;
  botStatus: BotStatus | null;
}

export interface TurnDoc {
  id: string;
  role: TurnRole;
  text: string;
  speaker: number | null;
  speakerName: string | null;
  /** Raw diarization label from the STT provider (enrolled name or "S1"…). */
  providerSpeakerLabel?: string | null;
  sourceUtteranceIds: string[];
  sequence: number;
  tokenEstimate: number;
  summarized: boolean;
  createdAt: string;
  /** Assistant turn the user cut off — `text` holds only what was spoken (or
   * everything synthesized, with `heardChars` marking how far playback got). */
  interrupted?: boolean;
  /** Chars of `text` actually heard before the stop, when the client reported
   * a playback position; null/absent means treat all of `text` as heard. */
  heardChars?: number | null;
}

export interface SessionSummaryDoc {
  rollingSummary: string;
  keyDecisions: string[];
  openQuestions: string[];
  timeline: string[];
  lastCoveredTurnId: string | null;
  updatedAt: string;
}

/**
 * Human-readable meeting summary shown in the Overview tab, generated once
 * from the full transcript when a session stops. Distinct from
 * `SessionSummaryDoc`, which is an internal rolling compaction of old turns
 * written for the AI's own context window, not for people to read.
 */
export interface MeetingSummaryDoc {
  overview: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
  generatedAt: string;
  turnCountAtGeneration: number;
}

/**
 * Cleaned-up transcript text, keyed by turn id. A light LLM pass repairs
 * punctuation, sentence boundaries, and obvious recognition errors so the
 * transcript reads naturally and the summary has clean input. Raw turns are
 * never overwritten: this sits alongside them, so a bad clean is always
 * reversible and the two can be diffed.
 */
export interface CleanedTranscriptTurn {
  /** Raw turn ids this reads from — more than one when a thought that got
   * split across several turns is stitched back together. */
  sourceTurnIds: string[];
  text: string;
}

export interface CleanedTranscriptDoc {
  /** The readable transcript, in order. Raw turns not referenced by any entry
   * were dropped as filler; the raw turns themselves still exist. */
  turns: CleanedTranscriptTurn[];
  generatedAt: string;
  turnCountAtGeneration: number;
  model: string;
}

export interface SessionFactDoc {
  id: string;
  text: string;
  category: "fact" | "preference" | "decision" | "todo" | "name";
  pinned: boolean;
  sourceTurnId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionPinDoc {
  id: string;
  turnId: string;
  label: string;
  snippet: string;
  createdAt: string;
}

export const CreateSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  speakerCount: z.number().int().min(1).max(10).default(2),
  projectId: z.string().trim().min(1).max(256).nullable().optional(),
  mode: SessionModeSchema.default("in_person"),
});

export const ListSessionsSchema = z.object({
  status: SessionStatusSchema.optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  projectId: z.string().trim().min(1).max(256).optional(),
  unassigned: z.coerce.boolean().default(false),
});

export const PatchSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  status: SessionStatusSchema.optional(),
  speakerCount: z.number().int().min(1).max(10).optional(),
  pinned: z.boolean().optional(),
  projectId: z.string().trim().min(1).max(256).nullable().optional(),
  mode: SessionModeSchema.optional(),
});

export const CreateTurnSchema = z.object({
  role: TurnRoleSchema,
  text: z.string().trim().min(1).max(16000),
  speaker: z.number().int().min(0).max(9).nullable().optional(),
  speakerName: z.string().trim().min(1).max(100).nullable().optional(),
  providerSpeakerLabel: z.string().trim().min(1).max(100).nullable().optional(),
  sourceUtteranceIds: z.array(z.string()).max(50).optional(),
});

// "That wasn't Jack" — reassign the display name on a batch of turns after a
// speaker misattribution. Null clears back to the generic "Other speaker".
export const RelabelTurnsSchema = z.object({
  turnIds: z.array(z.string().min(1).max(256)).min(1).max(200),
  speakerName: z.string().trim().min(1).max(100).nullable(),
});

// "Stop" mid-answer — the client reports how far playback got so the
// transcript reflects what was actually heard, not what was synthesized.
export const ReportAnswerInterruptedSchema = z.object({
  playedSeconds: z.number().min(0).max(3600),
  totalSeconds: z.number().min(0).max(3600).nullable().optional(),
});

export const CreateBotRequestSchema = z.object({
  sessionId: z.string().min(1),
  meetingUrl: z.string().url().max(2000),
});

export const CreatePinSchema = z.object({
  turnId: z.string().min(1),
  label: z.string().trim().min(1).max(120).optional(),
});

export const AskBodySchema = z.object({
  sessionId: z.string().min(1),
  /** Correlates browser speech/endpoint/playback timing with server stages. */
  turnId: z.string().uuid().optional(),
  // Generous by design: a spoken question is whatever the person said between
  // wake and silence, and a rambling monologue easily passes 4k chars (~4 min
  // of speech hit the old cap in the wild and 400'd after Kivo listened to all
  // of it). 12k ≈ 12+ minutes of continuous talking — an abuse bound, not a
  // realistic-speech bound. The web client tail-caps to this before sending.
  question: z.string().trim().min(1).max(12000),
  speaker: z.number().int().min(0).max(9).nullable().optional(),
  speakerName: z.string().trim().min(1).max(100).nullable().optional(),
  // Diarization label of the asker. Without it the persisted user_question turn
  // has no handle back to its speaker cluster, which made spoken questions the
  // one kind of line in the transcript that could never be corrected.
  providerSpeakerLabel: z.string().trim().min(1).max(100).nullable().optional(),
  // Raw live-transcript utterance ids that fed this question, so the persisted
  // user_question turn can dedup them out of the live tail in the UI. Long
  // captures produce one id per Speechmatics final — hundreds is legitimate.
  sourceUtteranceIds: z.array(z.string()).max(400).optional(),
});

/** One prior Q/A exchange, sent to the model as a real chat turn. */
export interface ContextHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ContextBundle {
  /** Concat of stableContext + liveTranscript — logs and legacy callers. */
  messages: string;
  /**
   * Slow-changing meeting brain: project, summary, facts, pins, session
   * identity. Cached across asks. Must not include `updatedAt` or the live
   * question — those bust the Anthropic prefix cache.
   */
  stableContext: string;
  /**
   * Volatile tail: the keyword archive lookup into parts of the session that
   * already fell out of the recent window. Empty for most asks. Recent room
   * speech is NOT here — it lives in `history`, in order.
   */
  liveTranscript: string;
  /**
   * The recent window as one chronological conversation: room speech, questions
   * put to Kivo, and Kivo's answers, in the order they happened. Consecutive
   * human turns are folded into a single user message.
   */
  history: ContextHistoryTurn[];
  tokenEstimate: number;
  /** Sanitized question used for search and the agent prompt. */
  question: string;
}

export interface SessionDetailResponse {
  session: SessionDoc;
  turns: TurnDoc[];
  summary: SessionSummaryDoc | null;
  meetingSummary: MeetingSummaryDoc | null;
  facts: SessionFactDoc[];
  pins: SessionPinDoc[];
}
