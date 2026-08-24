import type { SessionDoc } from "@/lib/sessions/types";

export type HomeHeroMode = "first_use" | "returning";

export function firstNameFromDisplayName(
  displayName: string | null | undefined,
): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || null;
}

export function homeGreeting(
  hour: number,
  displayName?: string | null,
): string {
  const name = firstNameFromDisplayName(displayName);
  const period = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${period}, ${name}` : period;
}

export function homeHeroMode(sessions: SessionDoc[]): HomeHeroMode {
  return sessions.length === 0 ? "first_use" : "returning";
}

export function mostRecentActiveSession(
  sessions: SessionDoc[],
): SessionDoc | null {
  return (
    sessions
      .filter((session) => session.status === "active" && session.turnCount > 0)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0] ?? null
  );
}
