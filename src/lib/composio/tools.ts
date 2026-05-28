import type { Tool } from "@openai/agents";
import type { SupportedToolkit } from "@/lib/composio/connections";
import {
  getCachedComposioAgentTools,
  loadComposioAgentTools,
  type ComposioToolsLoadOptions,
  type ComposioToolsLoadResult,
} from "./tools-cache";

export { fetchComposioAgentTools, filterToolsByToolkits } from "./fetch-tools";
export type { ComposioAgentToolsFetch } from "./fetch-tools";

export async function buildComposioAgentTools(
  uid: string | undefined,
  options: ComposioToolsLoadOptions
): Promise<Tool[]> {
  return getCachedComposioAgentTools(uid, options);
}

export { loadComposioAgentTools, type ComposioToolsLoadResult };
