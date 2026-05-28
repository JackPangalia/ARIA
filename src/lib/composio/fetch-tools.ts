import { tool, type Tool } from "@openai/agents";
import type { SupportedToolkit } from "@/lib/composio/connections";
import { logComposioToolExecute } from "@/lib/server/ask-pipeline-log";
import { getComposio, isComposioConfigured } from "./client";

// We rely on Composio's `important` flag to surface the high-signal subset
// of each toolkit (search/read/create/update for Notion, etc.) so the model
// isn't drowning in dozens of niche actions.
const MAX_TOOLS_PER_TOOLKIT = 40;

interface RawTool {
  slug: string;
  name: string;
  description?: string;
  inputParameters?: Record<string, unknown>;
}

export type ComposioAgentToolsFetch = {
  tools: Tool[];
  toolkitFingerprint: string;
};

function toAgentsTool(raw: RawTool, uid: string): Tool {
  const parameters = (raw.inputParameters ?? {
    type: "object",
    properties: {},
  }) as Record<string, unknown>;

  return tool({
    name: raw.slug,
    description:
      raw.description ?? raw.name ?? `Composio tool ${raw.slug}`,
    parameters: parameters as never,
    strict: false,
    async execute(input: unknown) {
      const t0 = performance.now();
      const composio = getComposio();
      const args =
        typeof input === "object" && input !== null
          ? (input as Record<string, unknown>)
          : {};
      const result = await composio.tools.execute(raw.slug, {
        userId: uid,
        arguments: args,
        dangerouslySkipVersionCheck: true,
      });
      logComposioToolExecute(raw.slug, performance.now() - t0);
      return JSON.stringify(result);
    },
  });
}

export function filterToolsByToolkits(
  tools: Tool[],
  toolkits: SupportedToolkit[]
): Tool[] {
  if (toolkits.length === 0) return [];
  const needles = toolkits.map((t) => t.toLowerCase());
  return tools.filter((entry) => {
    const name = (entry as { name?: string }).name?.toLowerCase() ?? "";
    return needles.some((tk) => name.includes(tk));
  });
}

/** Uncached Composio catalog fetch — used by the per-user tools cache. */
export async function fetchComposioAgentTools(
  uid: string,
  options?: { toolkits?: SupportedToolkit[] }
): Promise<ComposioAgentToolsFetch> {
  if (!isComposioConfigured()) {
    return { tools: [], toolkitFingerprint: "" };
  }

  const requested = options?.toolkits;
  if (requested && requested.length === 0) {
    return { tools: [], toolkitFingerprint: "" };
  }

  const composio = getComposio();

  const accounts = await composio.connectedAccounts.list({
    userIds: [uid],
    statuses: ["ACTIVE"],
  });

  let toolkits = Array.from(
    new Set(
      (accounts.items ?? [])
        .filter((item) => !item.isDisabled)
        .map((item) => item.toolkit.slug)
    )
  ).sort() as SupportedToolkit[];

  if (requested && requested.length > 0) {
    const allowed = new Set(requested);
    toolkits = toolkits.filter((t) => allowed.has(t));
  }

  const toolkitFingerprint = toolkits.join(",");

  if (toolkits.length === 0) {
    return { tools: [], toolkitFingerprint: "" };
  }

  const list = await composio.tools.getRawComposioTools({
    toolkits,
    important: true,
    limit: MAX_TOOLS_PER_TOOLKIT * toolkits.length,
  });

  return {
    tools: list.map((raw) => toAgentsTool(raw as RawTool, uid)),
    toolkitFingerprint,
  };
}
