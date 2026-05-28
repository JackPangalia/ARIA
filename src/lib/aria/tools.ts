import { tool, type Tool } from "@openai/agents";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { getGeminiApiKey } from "@/lib/aria/llm/gemini-client";
import { questionLikelyNeedsSearch } from "@/lib/aria/search-gating";

const MEETING_SNIPPET_MAX_CHARS = 2000;

function trimMeetingSnippet(messages: string | undefined): string | undefined {
  if (!messages?.trim()) return undefined;
  const trimmed = messages.trim();
  if (trimmed.length <= MEETING_SNIPPET_MAX_CHARS) return trimmed;
  return `…${trimmed.slice(-MEETING_SNIPPET_MAX_CHARS)}`;
}

export function getAriaTools(
  question: string | undefined,
  modelId: string,
  options?: { meetingSnippet?: string }
): Tool[] {
  if (!question || !questionLikelyNeedsSearch(question)) {
    return [];
  }

  const google = createGoogleGenerativeAI({ apiKey: getGeminiApiKey() });
  const meetingSnippet = trimMeetingSnippet(options?.meetingSnippet);

  return [
    tool({
      name: "google_search",
      description:
        "Search the web for current, factual, or time-sensitive information when the question needs fresh data beyond the meeting transcript, or when the user asked you to search.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Focused search query (include topic, timeframe, and geography when relevant).",
          },
        },
        required: ["query"],
      } as never,
      strict: false,
      async execute(input: unknown) {
        const args =
          typeof input === "object" && input !== null
            ? (input as { query?: string })
            : {};
        const query = args.query?.trim() ?? "";
        if (!query) return "No search query provided.";

        const userPrompt = meetingSnippet
          ? `Meeting context (for relevance only):\n${meetingSnippet}\n\nResearch query: ${query}`
          : `Research query: ${query}`;

        const { text } = await generateText({
          model: google(modelId),
          system: `You are a research assistant preparing notes for a live meeting voice assistant.
Use Google Search to gather current, factual information.
Return a concise briefing (4-8 sentences) with specific recent developments, names, and dates when available.
Name publications or sources when useful.
Do not role-play as the voice assistant or add filler — research notes only.`,
          prompt: userPrompt,
          tools: {
            google_search: google.tools.googleSearch({}),
          },
        });
        return text.trim() || "No search results found.";
      },
    }),
  ];
}

export { questionLikelyNeedsSearch } from "@/lib/aria/search-gating";
