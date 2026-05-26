import OpenAI from "openai";

const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL ?? "gpt-5.4-mini";

function getOpenAI(apiKey: string): OpenAI {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for summarization.");
  }
  return new OpenAI({ apiKey });
}

function parseSummaryResponse(raw: string): {
  rollingSummary: string;
  keyDecisions: string[];
  openQuestions: string[];
  timeline: string[];
  facts: Array<{
    text: string;
    category: "fact" | "preference" | "decision" | "todo" | "name";
  }>;
} {
  try {
    const parsed = JSON.parse(raw) as {
      rollingSummary?: string;
      keyDecisions?: string[];
      openQuestions?: string[];
      timeline?: string[];
      facts?: Array<{
        text?: string;
        category?: "fact" | "preference" | "decision" | "todo" | "name";
      }>;
    };

    return {
      rollingSummary: String(parsed.rollingSummary ?? "").trim(),
      keyDecisions: (parsed.keyDecisions ?? []).map(String).filter(Boolean),
      openQuestions: (parsed.openQuestions ?? []).map(String).filter(Boolean),
      timeline: (parsed.timeline ?? []).map(String).filter(Boolean),
      facts: (parsed.facts ?? [])
        .map((fact) => ({
          text: String(fact.text ?? "").trim(),
          category: fact.category ?? "fact",
        }))
        .filter((fact) => fact.text.length > 0),
    };
  } catch {
    return {
      rollingSummary: raw.trim(),
      keyDecisions: [],
      openQuestions: [],
      timeline: [],
      facts: [],
    };
  }
}

export { SUMMARY_MODEL, getOpenAI, parseSummaryResponse };
