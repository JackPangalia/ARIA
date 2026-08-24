import { describe, expect, it } from "vitest";
import {
  firstNameFromDisplayName,
  homeGreeting,
  homeHeroMode,
  mostRecentActiveSession,
} from "@/lib/home";
import type { SessionDoc } from "@/lib/sessions/types";

function session(overrides: Partial<SessionDoc> = {}): SessionDoc {
  return {
    id: "session-1",
    title: "Product review",
    projectId: null,
    autoTitled: false,
    status: "ended",
    speakerCount: 2,
    pinned: false,
    createdAt: "2026-08-20T18:00:00.000Z",
    updatedAt: "2026-08-20T19:00:00.000Z",
    endedAt: "2026-08-20T19:00:00.000Z",
    trashedAt: null,
    lastSummaryAt: null,
    tokenEstimate: 0,
    searchableTextPreview: "",
    turnCount: 6,
    mode: "in_person",
    transcriptionMode: "speaker",
    botId: null,
    meetingPlatform: null,
    botStatus: null,
    ...overrides,
  };
}

describe("Home helpers", () => {
  it("uses the first display-name token and handles missing names", () => {
    expect(firstNameFromDisplayName("  Maya Chen ")).toBe("Maya");
    expect(firstNameFromDisplayName(" ")).toBeNull();
    expect(homeGreeting(9, "Maya Chen")).toBe("Good morning, Maya");
    expect(homeGreeting(14)).toBe("Good afternoon");
    expect(homeGreeting(21, "Noah")).toBe("Good evening, Noah");
  });

  it("distinguishes first-use and returning Home states", () => {
    expect(homeHeroMode([])).toBe("first_use");
    expect(homeHeroMode([session()])).toBe("returning");
  });

  it("selects the newest active conversation with content", () => {
    const older = session({
      id: "older",
      status: "active",
      updatedAt: "2026-08-21T10:00:00.000Z",
    });
    const newer = session({
      id: "newer",
      status: "active",
      updatedAt: "2026-08-22T10:00:00.000Z",
    });
    const empty = session({
      id: "empty",
      status: "active",
      turnCount: 0,
      updatedAt: "2026-08-23T10:00:00.000Z",
    });

    expect(mostRecentActiveSession([older, empty, newer])?.id).toBe("newer");
    expect(mostRecentActiveSession([session(), empty])).toBeNull();
  });
});
