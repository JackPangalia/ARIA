import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tool, ToolSet } from "ai";
import * as fetchTools from "./fetch-tools";
import {
  getCachedComposioAgentTools,
  invalidateComposioToolsCache,
  loadComposioAgentTools,
  resetComposioToolsCacheForTests,
} from "./tools-cache";

vi.mock("@/lib/features", () => ({ CONNECTORS_ENABLED: true }));

const mockTool = { description: "Create a Notion page" } as unknown as Tool;
const mockGmailTool = { description: "Send an email" } as unknown as Tool;
const notionTools: ToolSet = { NOTION_CREATE_PAGE: mockTool };
const gmailTools: ToolSet = { GMAIL_SEND_EMAIL: mockGmailTool };

const emptyOptions = { toolkits: [] as import("./connections").SupportedToolkit[] };

describe("loadComposioAgentTools", () => {
  beforeEach(() => {
    resetComposioToolsCacheForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetComposioToolsCacheForTests();
    vi.restoreAllMocks();
  });

  it("returns empty array when uid is missing", async () => {
    const fetchSpy = vi.spyOn(fetchTools, "fetchComposioAgentTools");
    await expect(loadComposioAgentTools(undefined, emptyOptions)).resolves.toMatchObject({
      tools: {},
      cache: "skip",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns empty without fetch when no connector intent", async () => {
    const fetchSpy = vi.spyOn(fetchTools, "fetchComposioAgentTools");
    const result = await loadComposioAgentTools("user-1", { toolkits: [] });
    expect(result.tools).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns cached tools on second call within TTL", async () => {
    const fetchSpy = vi.spyOn(fetchTools, "fetchComposioAgentTools").mockResolvedValue({
      tools: notionTools,
      toolkitFingerprint: "notion",
    });

    const first = await loadComposioAgentTools("user-1", { toolkits: ["notion"] });
    const second = await loadComposioAgentTools("user-1", { toolkits: ["notion"] });

    expect(first.tools).toEqual(second.tools);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("filters cached catalog by toolkit intent", async () => {
    vi.spyOn(fetchTools, "fetchComposioAgentTools").mockResolvedValue({
      tools: { ...notionTools, ...gmailTools },
      toolkitFingerprint: "gmail,notion",
    });

    const notionOnly = await loadComposioAgentTools("user-2", {
      toolkits: ["notion"],
    });
    expect(notionOnly.toolCount).toBe(1);
    expect(Object.keys(notionOnly.tools)).toEqual(["NOTION_CREATE_PAGE"]);
  });

  it("refetches after invalidate", async () => {
    const fetchSpy = vi
      .spyOn(fetchTools, "fetchComposioAgentTools")
      .mockResolvedValueOnce({
        tools: notionTools,
        toolkitFingerprint: "notion",
      })
      .mockResolvedValueOnce({
        tools: {},
        toolkitFingerprint: "",
      });

    await loadComposioAgentTools("user-3", { toolkits: ["notion"] });
    invalidateComposioToolsCache("user-3");
    await loadComposioAgentTools("user-3", { toolkits: ["notion"] });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("single-flights concurrent fetches for the same user", async () => {
    let resolveFetch!: (value: fetchTools.ComposioAgentToolsFetch) => void;
    const fetchPromise = new Promise<fetchTools.ComposioAgentToolsFetch>(
      (resolve) => {
        resolveFetch = resolve;
      }
    );

    const fetchSpy = vi
      .spyOn(fetchTools, "fetchComposioAgentTools")
      .mockReturnValue(fetchPromise);

    const pendingA = loadComposioAgentTools("user-4", { toolkits: ["slack"] });
    const pendingB = loadComposioAgentTools("user-4", { toolkits: ["slack"] });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resolveFetch({ tools: notionTools, toolkitFingerprint: "slack" });

    const [a, b] = await Promise.all([pendingA, pendingB]);
    expect(a.tools).toEqual(b.tools);
  });
});

describe("getCachedComposioAgentTools", () => {
  beforeEach(() => {
    resetComposioToolsCacheForTests();
    vi.restoreAllMocks();
  });

  it("delegates to load with options", async () => {
    const fetchSpy = vi.spyOn(fetchTools, "fetchComposioAgentTools");
    await getCachedComposioAgentTools("user-5", { toolkits: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
