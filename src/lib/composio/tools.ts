import { tool, type Tool } from "@openai/agents";
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
      return JSON.stringify(result);
    },
  });
}

export async function buildComposioAgentTools(
  uid: string | undefined
): Promise<Tool[]> {
  if (!uid || !isComposioConfigured()) return [];

  const composio = getComposio();

  const accounts = await composio.connectedAccounts.list({
    userIds: [uid],
    statuses: ["ACTIVE"],
  });

  const toolkits = Array.from(
    new Set(
      (accounts.items ?? [])
        .filter((item) => !item.isDisabled)
        .map((item) => item.toolkit.slug)
    )
  );

  if (toolkits.length === 0) return [];

  const list = await composio.tools.getRawComposioTools({
    toolkits,
    important: true,
    limit: MAX_TOOLS_PER_TOOLKIT * toolkits.length,
  });

  return list.map((raw) => toAgentsTool(raw as RawTool, uid));
}
