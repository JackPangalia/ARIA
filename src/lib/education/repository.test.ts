import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  auth: vi.fn(),
  user: vi.fn(),
  failRead: false,
  failWrite: false,
  tail: Promise.resolve() as Promise<unknown>,
}));

vi.mock("@/lib/firebase/admin", () => {
  const ref = (path: string): unknown => ({
    path,
    collection: (name: string) => ref(`${path}/${name}`),
    doc: (name: string) => ref(`${path}/${name}`),
    get: async () => {
      if (fake.failRead) throw new Error("Database unavailable");
      return { exists: fake.docs.has(path), data: () => fake.docs.get(path) };
    },
  });
  return {
    getAdminAuth: () => ({ verifyIdToken: fake.auth, getUser: fake.user }),
    getAdminDb: () => ({
      collection: (name: string) => ref(name),
      runTransaction: (run: (transaction: unknown) => Promise<unknown>) => {
        // Serialize transactions like Firestore's conflict/retry guarantee.
        const result = fake.tail.then(() => run({
          get: (r: { get: () => Promise<unknown> }) => r.get(),
          set: (r: { path: string }, data: unknown) => {
            if (fake.failWrite) throw new Error("Write unavailable");
            fake.docs.set(r.path, structuredClone(data));
          },
        }));
        fake.tail = result.catch(() => {});
        return result;
      },
    }),
  };
});

import { GET, PATCH } from "@/app/api/education/route";
import { readEducation, updateEducation } from "./repository";

function request(token?: string, body?: unknown) {
  return new Request("http://localhost/api/education", {
    method: body === undefined ? "GET" : "PATCH",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  fake.docs.clear();
  fake.failRead = false;
  fake.failWrite = false;
  fake.tail = Promise.resolve();
  fake.auth.mockReset().mockImplementation(async (token: string) => {
    if (token === "invalid") throw new Error("Invalid token");
    return { uid: token, email: null };
  });
  fake.user.mockReset().mockImplementation(async (uid: string) => ({
    metadata: { creationTime: uid === "old" ? "2026-08-01T00:00:00Z" : "2026-08-28T00:00:00Z" },
  }));
});

describe("education API and persistence", () => {
  it("requires authentication for reads and writes", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("invalid"))).status).toBe(401);
    expect((await PATCH(request(undefined, { action: "restart" }))).status).toBe(401);
    expect(fake.docs.size).toBe(0);
    expect(fake.user).not.toHaveBeenCalled();
  });
  it("derives first-use defaults without writing and never caches account data", async () => {
    const response = await GET(request("new"));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ enabled: true, retired: [] });
    expect((await readEducation("old")).enabled).toBe(false);
    expect(fake.docs.size).toBe(0);
  });
  it("automatically enables new accounts without any environment configuration", async () => {
    vi.stubEnv("EDUCATION_RELEASE_AT", "");
    expect((await readEducation("new")).enabled).toBe(true);
    expect((await updateEducation("old", { action: "restart" })).enabled).toBe(true);
    vi.unstubAllEnvs();
  });
  it("preserves a new user's explicit hide preference after subsequent reads", async () => {
    await updateEducation("new", { action: "hide", generation: 0 });
    expect((await readEducation("new")).enabled).toBe(false);
  });
  it("validates payloads and derives the account only from the bearer token", async () => {
    expect((await PATCH(request("alice", { action: "restart", uid: "bob" }))).status).toBe(400);
    expect((await PATCH(request("alice", { action: "retire", topic: "unknown", generation: 0 }))).status).toBe(400);
    const badJSON = new Request("http://localhost/api/education", { method: "PATCH", headers: { Authorization: "Bearer alice" }, body: "{" });
    expect((await PATCH(badJSON)).status).toBe(400);
    await PATCH(request("alice", { action: "retire", topic: "speaker", generation: 0 }));
    expect([...fake.docs.keys()]).toEqual(["users/alice/private/education"]);
    expect((await readEducation("bob")).retired).toEqual([]);
  });
  it("preserves simultaneous retirements and reloads saved progress", async () => {
    await Promise.all([
      updateEducation("alice", { action: "retire", topic: "speaker", generation: 0 }),
      updateEducation("alice", { action: "retire", topic: "wake", generation: 0 }),
      updateEducation("alice", { action: "hide", generation: 0 }),
    ]);
    const saved = await (await GET(request("alice"))).json();
    expect(saved.retired).toEqual(["speaker", "wake"]);
    expect(saved.enabled).toBe(false);
    expect(saved.revision).toBe(3);
  });
  it("replays independently of legacy onboarding and ignores delayed old writes", async () => {
    await PATCH(request("old", { action: "restart" }));
    await PATCH(request("old", { action: "retire", topic: "speaker", generation: 0 }));
    expect(await readEducation("old")).toMatchObject({ enabled: true, retired: [], generation: 1 });
    expect(fake.docs.has("users/old/private/plan")).toBe(false);
  });
  it("returns errors without reporting a failed write as saved", async () => {
    fake.failRead = true;
    expect((await GET(request("alice"))).status).toBe(500);
    fake.failRead = false;
    fake.failWrite = true;
    expect((await PATCH(request("alice", { action: "restart" }))).status).toBe(500);
    expect(fake.docs.size).toBe(0);
  });
});
