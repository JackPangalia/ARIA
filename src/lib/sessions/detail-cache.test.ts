import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionDetail = vi.fn();

vi.mock("@/lib/sessions/client", () => ({
  getSessionDetail: (sessionId: string) => getSessionDetail(sessionId),
}));

import {
  getCachedSessionDetail,
  invalidateSessionDetail,
  loadSessionDetail,
  prefetchSessionDetail,
  primeSessionDetail,
} from "@/lib/sessions/detail-cache";

function detail(id: string, title = "Conversation") {
  return {
    session: { id, title },
    turns: [],
  } as never;
}

beforeEach(() => {
  invalidateSessionDetail();
  getSessionDetail.mockReset();
  getSessionDetail.mockImplementation(async (id: string) => detail(id));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session detail cache", () => {
  it("serves a prefetched detail without a second request", async () => {
    prefetchSessionDetail("s1");
    await vi.waitFor(() => expect(getCachedSessionDetail("s1")).not.toBeNull());

    await loadSessionDetail("s1");
    expect(getSessionDetail).toHaveBeenCalledTimes(1);
  });

  it("de-dupes concurrent loads of the same session", async () => {
    const [a, b] = await Promise.all([
      loadSessionDetail("s1"),
      loadSessionDetail("s1"),
    ]);
    expect(getSessionDetail).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("refetches when forced, so a revalidate is never served from cache", async () => {
    await loadSessionDetail("s1");
    await loadSessionDetail("s1", { force: true });
    expect(getSessionDetail).toHaveBeenCalledTimes(2);
  });

  it("treats an entry older than the freshness window as a miss", async () => {
    vi.useFakeTimers();
    primeSessionDetail(detail("s1"));
    expect(getCachedSessionDetail("s1")).not.toBeNull();

    vi.advanceTimersByTime(21_000);
    expect(getCachedSessionDetail("s1")).toBeNull();
  });

  it("drops an invalidated session so a mutation is never shown stale", async () => {
    await loadSessionDetail("s1");
    invalidateSessionDetail("s1");
    expect(getCachedSessionDetail("s1")).toBeNull();
  });

  it("does not cache a failed fetch", async () => {
    getSessionDetail.mockRejectedValueOnce(new Error("boom"));
    await expect(loadSessionDetail("s1")).rejects.toThrow("boom");
    expect(getCachedSessionDetail("s1")).toBeNull();

    await loadSessionDetail("s1");
    expect(getSessionDetail).toHaveBeenCalledTimes(2);
  });
});
