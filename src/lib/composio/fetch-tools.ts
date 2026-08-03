import { jsonSchema, tool, type ToolSet } from "ai";
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
  tools: ToolSet;
  toolkitFingerprint: string;
};

function toAgentsTool(raw: RawTool, uid: string) {
  // Composio hands back raw JSON Schema, so it goes in as-is rather than
  // through Zod like our first-party tools.
  const parameters = (raw.inputParameters ?? {
    type: "object",
    properties: {},
  }) as Record<string, unknown>;

  return tool({
    description: raw.description ?? raw.name ?? `Composio tool ${raw.slug}`,
    inputSchema: jsonSchema(parameters as never),
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
  tools: ToolSet,
  toolkits: SupportedToolkit[]
): ToolSet {
  if (toolkits.length === 0) return {};
  const needles = toolkits.map((t) => t.toLowerCase());
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => {
      const lowered = name.toLowerCase();
      return needles.some((tk) => lowered.includes(tk));
    })
  );
}

/** Uncached Composio catalog fetch — used by the per-user tools cache. */
export async function fetchComposioAgentTools(
  uid: string,
  options?: { toolkits?: SupportedToolkit[] }
): Promise<ComposioAgentToolsFetch> {
  if (!isComposioConfigured()) {
    return { tools: {}, toolkitFingerprint: "" };
  }

  const requested = options?.toolkits;
  if (requested && requested.length === 0) {
    return { tools: {}, toolkitFingerprint: "" };
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
    return { tools: {}, toolkitFingerprint: "" };
  }

  const list = await composio.tools.getRawComposioTools({
    toolkits,
    important: true,
    limit: MAX_TOOLS_PER_TOOLKIT * toolkits.length,
  });

  const tools: ToolSet = {};
  for (const entry of list) {
    const raw = entry as RawTool;
    tools[raw.slug] = toAgentsTool(raw, uid);
  }

  return { tools, toolkitFingerprint };
}
