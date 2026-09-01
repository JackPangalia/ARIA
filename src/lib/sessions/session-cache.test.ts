import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_CACHE_TTL_MS,
  invalidateCachedSession,
  readCachedSession,
  resetSessionCacheForTests,
  storeCachedSession,
} from "./session-cache";
import type { SessionDoc } from "./types";

function session(overrides: Partial<SessionDoc> = {}): SessionDoc {
  return {
    id: "s1",
    title: "Pricing",
    projectId: null,
    autoTitled: false,
    status: "active",
    speakerCount: 2,
    pinned: false,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z",
    endedAt: null,
    trashedAt: null,
    lastSummaryAt: null,
    tokenEstimate: 0,
    searchableTextPreview: "",
    turnCount: 0,
    mode: "in_person",
    transcriptionMode: "speaker",
    ...overrides,
  } as SessionDoc;
}

afterEach(() => {
  resetSessionCacheForTests();
  vi.useRealTimers();
});

describe("session cache", () => {
  it("serves a stored session back to the same owner", () => {
    storeCachedSession("uid-1", session());
    expect(readCachedSession("uid-1", "s1")?.title).toBe("Pricing");
  });

  it("never serves one user's session to another", () => {
    storeCachedSession("uid-1", session());
    // The ask path treats a hit as proof of ownership, so a key collision on
    // sessionId alone would hand someone else's conversation to the caller.
    expect(readCachedSession("uid-2", "s1")).toBeNull();
  });

  it("drops the entry once invalidated", () => {
    storeCachedSession("uid-1", session());
    invalidateCachedSession("uid-1", "s1");
    expect(readCachedSession("uid-1", "s1")).toBeNull();
  });

  it("expires the entry after the TTL", () => {
    vi.useFakeTimers();
    storeCachedSession("uid-1", session());
    vi.advanceTimersByTime(SESSION_CACHE_TTL_MS + 1);
    expect(readCachedSession("uid-1", "s1")).toBeNull();
  });

  it("keeps an archived status visible rather than masking it", () => {
    // A cached entry must carry the real status through: /api/ask rejects
    // archived sessions off this exact field.
    storeCachedSession("uid-1", session({ status: "archived" }));
    expect(readCachedSession("uid-1", "s1")?.status).toBe("archived");
  });
});
