import type { SessionStatus } from "@/lib/sessions/types";

/**
 * Pure selection logic for the retention deletion cron. Both the display-side
 * hiding (listSessions' `since` filter) and this hard-delete read the same
 * `historyRetentionDays` from src/lib/plan/tiers.ts, so the marketing claim,
 * the UI, and the purge can't drift apart. The purge trails the hiding by a
 * grace buffer: a session disappears from the UI at the retention boundary and
 * is physically deleted GRACE_DAYS later.
 */

export const RETENTION_GRACE_DAYS = 7;

export interface RetentionCandidate {
  id: string;
  status: SessionStatus;
  pinned: boolean;
  /** ISO timestamp of the session's last activity. */
  updatedAt: string;
}

export function retentionCutoffIso(
  retentionDays: number | null,
  now: Date,
  graceDays: number = RETENTION_GRACE_DAYS
): string | null {
  if (retentionDays == null) return null; // Unlimited history — never purge.
  const cutoff = new Date(
    now.getTime() - (retentionDays + graceDays) * 86_400_000
  );
  return cutoff.toISOString();
}

export function selectExpiredSessions(input: {
  sessions: RetentionCandidate[];
  retentionDays: number | null;
  now: Date;
  graceDays?: number;
}): string[] {
  const cutoff = retentionCutoffIso(
    input.retentionDays,
    input.now,
    input.graceDays
  );
  if (cutoff == null) return [];

  return input.sessions
    .filter(
      (s) =>
        s.updatedAt < cutoff &&
        // Pinned sessions are explicitly kept; a live session is never expired.
        !s.pinned &&
        s.status !== "active"
    )
    .map((s) => s.id);
}
