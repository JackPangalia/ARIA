import type { Tool } from "@openai/agents";
import type { SupportedToolkit } from "@/lib/composio/connections";
import { logComposioCache } from "@/lib/server/ask-pipeline-log";
import {
  fetchComposioAgentTools,
  filterToolsByToolkits,
} from "./fetch-tools";

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type ComposioCacheStatus = "hit" | "miss" | "empty" | "skip";

export type ComposioToolsLoadOptions = {
  /** Resolved connector slugs; `[]` skips Composio tools entirely. */
  toolkits: SupportedToolkit[];
};

export type ComposioToolsLoadResult = {
  tools: Tool[];
  cache: ComposioCacheStatus;
  fetchMs: number;
  toolCount: number;
  toolkitFingerprint: string;
  intentToolkits: string;
};

function resolveTtlMs(): number {
  const raw = process.env.COMPOSIO_TOOLS_CACHE_TTL_MS;
  if (!raw) return DEFAULT_TTL_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

interface CacheEntry {
  tools: Tool[];
  expiresAt: number;
  toolkitFingerprint: string;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<
  string,
  Promise<{ tools: Tool[]; toolkitFingerprint: string; cache: ComposioCacheStatus }>
>();

export function invalidateComposioToolsCache(uid: string): void {
  cache.delete(uid);
  inflight.delete(uid);
}

/** Clears all cache state — for tests only. */
export function resetComposioToolsCacheForTests(): void {
  cache.clear();
  inflight.clear();
}

async function loadFullCatalog(
  uid: string
): Promise<{
  tools: Tool[];
  toolkitFingerprint: string;
  cache: ComposioCacheStatus;
}> {
  const fetchStart = performance.now();
  const result = await fetchComposioAgentTools(uid);
  const fetchMs = performance.now() - fetchStart;
  const cacheStatus: ComposioCacheStatus =
    result.tools.length === 0 ? "empty" : "miss";

  const entry: CacheEntry = {
    tools: result.tools,
    toolkitFingerprint: result.toolkitFingerprint,
    expiresAt: Date.now() + resolveTtlMs(),
  };
  cache.set(uid, entry);

  logComposioCache(uid, {
    cache: cacheStatus,
    fetchMs,
    toolCount: result.tools.length,
    toolkitFingerprint: result.toolkitFingerprint,
  });

  return {
    tools: entry.tools,
    toolkitFingerprint: entry.toolkitFingerprint,
    cache: cacheStatus,
  };
}

function applyToolkitFilter(
  tools: Tool[],
  toolkits: SupportedToolkit[]
): Tool[] {
  if (toolkits.length === 0) return [];
  return filterToolsByToolkits(tools, toolkits);
}

export async function loadComposioAgentTools(
  uid: string | undefined,
  options: ComposioToolsLoadOptions
): Promise<ComposioToolsLoadResult> {
  const intentLabel = options.toolkits.join(",") || "none";

  if (!uid) {
    return {
      tools: [],
      cache: "skip",
      fetchMs: 0,
      toolCount: 0,
      toolkitFingerprint: "",
      intentToolkits: intentLabel,
    };
  }

  if (options.toolkits.length === 0) {
    return {
      tools: [],
      cache: "skip",
      fetchMs: 0,
      toolCount: 0,
      toolkitFingerprint: "",
      intentToolkits: intentLabel,
    };
  }

  const loadStart = performance.now();
  const now = Date.now();
  const hit = cache.get(uid);

  if (hit && hit.expiresAt > now) {
    const filtered = applyToolkitFilter(hit.tools, options.toolkits);
    const fetchMs = performance.now() - loadStart;
    logComposioCache(uid, {
      cache: "hit",
      fetchMs,
      toolCount: filtered.length,
      toolkitFingerprint: options.toolkits.join(","),
    });
    return {
      tools: filtered,
      cache: "hit",
      fetchMs,
      toolCount: filtered.length,
      toolkitFingerprint: options.toolkits.join(","),
      intentToolkits: intentLabel,
    };
  }

  if (hit && hit.expiresAt <= now) {
    cache.delete(uid);
  }

  let pending = inflight.get(uid);
  if (!pending) {
    pending = loadFullCatalog(uid).finally(() => {
      inflight.delete(uid);
    });
    inflight.set(uid, pending);
  }

  const { tools: fullTools, cache: cacheStatus } = await pending;
  const filtered = applyToolkitFilter(fullTools, options.toolkits);
  const fetchMs = performance.now() - loadStart;

  return {
    tools: filtered,
    cache: cacheStatus,
    fetchMs,
    toolCount: filtered.length,
    toolkitFingerprint: options.toolkits.join(","),
    intentToolkits: intentLabel,
  };
}

export async function getCachedComposioAgentTools(
  uid: string | undefined,
  options: ComposioToolsLoadOptions
): Promise<Tool[]> {
  return (await loadComposioAgentTools(uid, options)).tools;
}

/** Warm path: load full connected catalog into cache. */
export async function warmComposioToolsCache(uid: string): Promise<void> {
  if (!uid) return;
  const now = Date.now();
  const hit = cache.get(uid);
  if (hit && hit.expiresAt > now) return;

  let pending = inflight.get(uid);
  if (!pending) {
    pending = loadFullCatalog(uid).finally(() => {
      inflight.delete(uid);
    });
    inflight.set(uid, pending);
  }
  await pending;
}
