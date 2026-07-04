import { z } from "zod";

export const SessionStatusSchema = z.enum(["active", "ended", "archived", "trashed"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const TurnRoleSchema = z.enum(["speaker", "user_question", "assistant"]);
export type TurnRole = z.infer<typeof TurnRoleSchema>;

export const SessionModeSchema = z.enum(["in_person", "bot"]);
export type SessionMode = z.infer<typeof SessionModeSchema>;

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
  /** "in_person" (default, mic) or "bot" (Recall meeting bot). */
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
}

export interface SessionSummaryDoc {
  rollingSummary: string;
  keyDecisions: string[];
  openQuestions: string[];
  timeline: string[];
  lastCoveredTurnId: string | null;
  updatedAt: string;
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
  question: z.string().trim().min(1).max(4000),
  speaker: z.number().int().min(0).max(9).nullable().optional(),
  speakerName: z.string().trim().min(1).max(100).nullable().optional(),
  // Raw live-transcript utterance ids that fed this question, so the persisted
  // user_question turn can dedup them out of the live tail in the UI.
  sourceUtteranceIds: z.array(z.string()).max(50).optional(),
});

export interface ContextBundle {
  messages: string;
  tokenEstimate: number;
  /** Sanitized question used for search and the agent prompt. */
  question: string;
}

export interface SessionDetailResponse {
  session: SessionDoc;
  turns: TurnDoc[];
  summary: SessionSummaryDoc | null;
  facts: SessionFactDoc[];
  pins: SessionPinDoc[];
}
