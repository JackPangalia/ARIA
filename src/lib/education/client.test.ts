import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ currentUser: null as null | { uid: string; getIdToken: () => Promise<string> } }));
vi.mock("@/lib/firebase/client", () => ({ auth: fixture }));
import { educationRequest } from "./client";

beforeEach(() => {
  fixture.currentUser = { uid: "alice", getIdToken: async () => "alice-token" };
});
afterEach(() => vi.unstubAllGlobals());

describe("education client", () => {
  it("uses the authenticated token and validates server progress", async () => {
    const state = { version: 1, enabled: true, retired: ["speaker"], generation: 0, revision: 1 };
    const fetcher = vi.fn().mockResolvedValue(Response.json(state));
    vi.stubGlobal("fetch", fetcher);
    expect(await educationRequest("alice", { action: "retire", topic: "speaker", generation: 0 })).toEqual(state);
    expect(fetcher).toHaveBeenCalledWith("/api/education", expect.objectContaining({
      method: "PATCH", cache: "no-store", headers: expect.objectContaining({ Authorization: "Bearer alice-token" }),
    }));
  });
  it("does not send queued mutations under another signed-in account", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(educationRequest("bob", { action: "restart" })).rejects.toThrow("Sign in");
    fixture.currentUser = null;
    await expect(educationRequest("alice")).rejects.toThrow("Sign in");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never treats network failures, failed saves, or malformed data as progress", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ enabled: true }));
    vi.stubGlobal("fetch", fetcher);
    await expect(educationRequest("alice")).rejects.toThrow();
    await expect(educationRequest("alice", { action: "restart" })).rejects.toThrow("Couldn’t save");
    await expect(educationRequest("alice")).rejects.toThrow();
  });
});
