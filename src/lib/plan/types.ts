import { z } from "zod";
import type { Tier } from "@/lib/plan/tiers";
import type { TranscriptionMode } from "@/lib/sessions/types";
import type { AskModelId } from "@/lib/aria/models";

/**
 * The user's plan record. Stored server-write-only at `users/{uid}/private/plan`
 * (see firestore.rules) so a client cannot grant itself a higher tier. Stripe will
 * later write `tier` + `billingAnchorDay` here; until then `setUserTier` (admin)
 * is the only writer.
 */
export interface UserPlanDoc {
  tier: Tier;
  /** Day-of-month (1–28) the monthly billing period rolls over. Defaults to signup day. */
  billingAnchorDay: number;
  createdAt: string;
  updatedAt: string;
  /** Stripe Customer ID, set on first checkout or webhook sync. */
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  stripeStatus?: string | null;
  cancelAtPeriodEnd?: boolean;
  /** ISO timestamp when the current Stripe billing period ends. */
  currentPeriodEnd?: string | null;
  /** Pre-paid additional listening seconds purchased via Top-Up packs (never expire). */
  topUpListeningSeconds?: number | null;
  /** Preferred mode for new sessions (canonical mode is "speaker"). */
  defaultTranscriptionMode?: TranscriptionMode | null;
  /** Preferred LLM for Kivo's live spoken answers. `null`/unset falls back to the default. */
  answerModel?: AskModelId | null;
  /** Preferred Kivo voice (curated Cartesia preset). `null`/unset = env default. */
  voiceId?: string | null;
  /** ISO timestamp when the user finished first-run onboarding. */
  onboardingCompletedAt?: string | null;
}

/**
 * Per-period usage counters. One doc per period at `users/{uid}/usage/{periodKey}`.
 * Server-write-only. Listening time is accrued from timed client heartbeats; ask
 * usage is recorded after each answer completes.
 */
export interface UsageDoc {
  periodKey: string;
  listeningSeconds: number;
  /**
   * Subset of `listeningSeconds` accrued while a session was in `speaker`
   * transcription mode. Diarization is now standard across all tiers.
   */
  speakerSeconds: number;
  askTokens: number;
  askCount: number;
  /** ISO timestamp of the last heartbeat, used to compute the next accrual delta. */
  lastHeartbeatAt: string | null;
  /** Session whose heartbeats are currently being accrued. */
  activeSessionId: string | null;
  updatedAt: string;
}

export function emptyUsage(periodKey: string): UsageDoc {
  return {
    periodKey,
    listeningSeconds: 0,
    speakerSeconds: 0,
    askTokens: 0,
    askCount: 0,
    lastHeartbeatAt: null,
    activeSessionId: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Shape returned to the client for the in-app usage meter. */
export interface UsageSummary {
  tier: Tier;
  periodKey: string;
  periodUnit: "week" | "month";
  resetsAt: string;
  topUpRemainingSeconds: number;
  listening: {
    usedSeconds: number;
    capSeconds: number;
    remainingSeconds: number;
    pct: number;
    exhausted: boolean;
  };
  asks: {
    usedTokens: number;
    capTokens: number;
    pct: number;
    exhausted: boolean;
  };
}

export const HeartbeatBodySchema = z.object({
  sessionId: z.string().min(1).max(256),
});
