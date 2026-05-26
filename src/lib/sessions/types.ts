import { z } from "zod";

export const SessionStatusSchema = z.enum(["active", "ended", "archived"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const TurnRoleSchema = z.enum(["speaker", "user_question", "assistant"]);
export type TurnRole = z.infer<typeof TurnRoleSchema>;

export interface SessionDoc {
  id: string;
  title: string;
  status: SessionStatus;
  speakerCount: number;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  lastSummaryAt: string | null;
  tokenEstimate: number;
  searchableTextPreview: string;
  turnCount: number;
}

export interface TurnDoc {
  id: string;
  role: TurnRole;
  text: string;
  speaker: number | null;
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
});

export const ListSessionsSchema = z.object({
  status: SessionStatusSchema.optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const PatchSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  status: SessionStatusSchema.optional(),
  speakerCount: z.number().int().min(1).max(10).optional(),
});

export const CreateTurnSchema = z.object({
  role: TurnRoleSchema,
  text: z.string().trim().min(1).max(16000),
  speaker: z.number().int().min(0).max(9).nullable().optional(),
  sourceUtteranceIds: z.array(z.string()).max(50).optional(),
});

export const CreatePinSchema = z.object({
  turnId: z.string().min(1),
  label: z.string().trim().min(1).max(120).optional(),
});

export const AskBodySchema = z.object({
  sessionId: z.string().min(1),
  question: z.string().trim().min(1).max(4000),
});

export interface ContextBundle {
  messages: string;
  tokenEstimate: number;
}

export interface SessionDetailResponse {
  session: SessionDoc;
  turns: TurnDoc[];
  summary: SessionSummaryDoc | null;
  facts: SessionFactDoc[];
  pins: SessionPinDoc[];
}
