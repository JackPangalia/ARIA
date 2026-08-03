import { anthropic } from "@ai-sdk/anthropic";
import type { ToolSet } from "ai";

/**
 * Tool name the model calls; also what agent.ts watches for to fire the
 * "searching" stream signal. The AI SDK maps Anthropic's provider-side
 * `web_search` back to whatever key we register here, so this string is what
 * shows up on the stream parts.
 */
export const WEB_SEARCH_TOOL_NAME = "web_search";

/**
 * Anthropic runs query generation, retrieval, result filtering, and any refine
 * loop inside the same request that writes the answer — nothing comes back to
 * us in between. Two searches is enough for a follow-up refine while capping
 * the worst case, which matters because the user is waiting mid-conversation.
 */
const MAX_SEARCHES_PER_TURN = 2;

export function getAriaTools(question: string | undefined): ToolSet {
  if (!question) {
    return {};
  }

  return {
    // Not the newer webSearch_20260209: that one is only callable through
    // Anthropic's code-execution sandbox, and the API rejects it outright on
    // Haiku 4.5 ("does not support programmatic tool calling"). The SDK offers
    // no way to set `allowed_callers` on a provider tool, so this is the
    // version that works across every ask model we serve.
    //
    // The cast is the SDK's gap, not ours: `ToolSet` can't express a
    // provider-executed tool's typed input/output, though streamText accepts
    // one at runtime.
    //
    // NOTE: the AI SDK currently mis-pairs `server_tool_use` with a regular
    // `tool_use` when both land in one assistant turn. Harmless while search is
    // our only tool; revisit when Composio's client-executed tools come back.
    [WEB_SEARCH_TOOL_NAME]: anthropic.tools.webSearch_20250305({
      maxUses: MAX_SEARCHES_PER_TURN,
    }) as ToolSet[string],
  };
}
