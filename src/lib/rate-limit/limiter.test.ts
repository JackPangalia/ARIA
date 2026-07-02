import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, requestIpKey } from "@/lib/rate-limit/limiter";
import { getAdminDb } from "@/lib/firebase/admin";

vi.mock("@/lib/firebase/admin", () => ({ getAdminDb: vi.fn() }));

/** In-memory stand-in for the Firestore counter docs the limiter touches. */
function fakeDb(store: Map<string, { count: number }>) {
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({ id: `${name}/${id}` }),
    }),
    runTransaction: async (
      fn: (tx: {
        get: (ref: { id: string }) => Promise<{
          exists: boolean;
          data: () => { count: number } | undefined;
        }>;
        set: (ref: { id: string }, data: { count: unknown }) => void;
      }) => Promise<unknown>
    ) =>
      fn({
        get: async (ref) => {
          const doc = store.get(ref.id);
          return { exists: doc != null, data: () => doc };
        },
        set: (ref) => {
          const doc = store.get(ref.id);
          store.set(ref.id, { count: (doc?.count ?? 0) + 1 });
        },
      }),
  };
}

const CONFIG = { name: "test", limit: 3, windowSeconds: 60 };

let store: Map<string, { count: number }>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-02T10:00:30Z"));
  store = new Map();
  vi.mocked(getAdminDb).mockReturnValue(
    fakeDb(store) as unknown as ReturnType<typeof getAdminDb>
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit and denies at the limit", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit("u1", CONFIG)).allowed).toBe(true);
    }
    const denied = await checkRateLimit("u1", CONFIG);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("keeps separate counters per key", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("u1", CONFIG);
    expect((await checkRateLimit("u1", CONFIG)).allowed).toBe(false);
    expect((await checkRateLimit("u2", CONFIG)).allowed).toBe(true);
  });

  it("resets when the window rolls over", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("u1", CONFIG);
    expect((await checkRateLimit("u1", CONFIG)).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-07-02T10:01:01Z"));
    expect((await checkRateLimit("u1", CONFIG)).allowed).toBe(true);
  });

  it("fails open when Firestore errors", async () => {
    vi.mocked(getAdminDb).mockImplementation(() => {
      throw new Error("firestore down");
    });
    const result = await checkRateLimit("u1", CONFIG);
    expect(result.allowed).toBe(true);
  });

  it("sanitizes keys so hostile anon ids cannot break doc paths", async () => {
    const result = await checkRateLimit("../evil/path", CONFIG);
    expect(result.allowed).toBe(true);
    const ids = [...store.keys()];
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toContain("/evil");
  });
});

describe("requestIpKey", () => {
  it("uses the first x-forwarded-for hop", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(requestIpKey(req)).toBe("ip_1.2.3.4");
  });

  it("falls back when no header is present", () => {
    expect(requestIpKey(new Request("http://x"))).toBe("ip_unknown");
  });
});
