import { listTurns, patchSession } from "@/lib/sessions/repository";
import { geminiGenerateText } from "@/lib/aria/llm/gemini-client";
import { getServerEnv, getSummaryModelId } from "@/lib/env";

export async function autoTitleSession(
  uid: string,
  sessionId: string,
  currentTitle: string
): Promise<string | null> {
  const isGeneric =
    currentTitle.startsWith("Session ") || currentTitle === "Untitled session";
  if (!isGeneric) return null;

  try {
    const turns = await listTurns(uid, sessionId, 15);
    if (turns.length < 2) return null;

    const transcript = turns
      .map((turn) => {
        let label = "Speaker";
        if (turn.role === "assistant") label = "Kivo";
        else if (turn.role === "user_question") label = "Question";
        return `${label}: ${turn.text}`;
      })
      .join("\n");

    const env = getServerEnv();
    const rawTitle = await geminiGenerateText({
      model: getSummaryModelId(env),
      system:
        "You are an assistant that titles meeting sessions. Based on the transcript snippet, generate a highly punchy, descriptive title of exactly 3 to 5 words. Do not use quotes, punctuation, or generic terms like 'Session', 'Meeting', 'Discussion', 'Conversation', or 'Audio'.",
      user: `Transcript:\n${transcript}`,
      maxOutputTokens: 24,
    });

    const cleanedTitle = rawTitle.replace(/["'./]/g, "").slice(0, 100);

    if (cleanedTitle) {
      await patchSession(uid, sessionId, { title: cleanedTitle });
      return cleanedTitle;
    }
  } catch (error) {
    console.error("[Auto-Title] Error generating title:", error);
  }
  return null;
}
