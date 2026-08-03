import {
  assertSessionOwner,
  formatTurnForContext,
  getSummary,
  listTurns,
  patchSession,
} from "@/lib/sessions/repository";
import { llmGenerateText } from "@/lib/aria/llm/anthropic-client";
import { KIVO_MODEL_ID } from "@/lib/aria/models";
import type { SessionDoc, TurnDoc } from "@/lib/sessions/types";

export type AutoTitleSource = "listening" | "qa" | "finalize";

export type AutoTitleInput = {
  source: AutoTitleSource;
  /** First question to Kivo — avoids waiting on turn persistence when provided. */
  question?: string;
  /** Kivo's answer — paired with `question` for the Q&A title path. */
  answer?: string;
};

const MIN_SPEAKER_TURNS = 3;
const MIN_SPEAKER_CHARS = 180;
const MIN_SUBSTANTIVE_CHARS = 12;
const MAX_TITLE_CHARS = 60;

const FILLER_UTTERANCES = new Set([
  "yeah",
  "yes",
  "no",
  "ok",
  "okay",
  "uh huh",
  "mm hmm",
  "mhm",
  "right",
  "sure",
  "thanks",
  "thank you",
  "hello",
  "hi",
  "hey",
  "good morning",
  "good afternoon",
  "how are you",
]);

const LISTENING_TITLE_SYSTEM = `You title live meeting sessions for a voice assistant that listens to conversations.

Goal: Produce a very short, descriptive title (2–5 words) that names the main topic being discussed in the excerpt.

Rules:
- Output ONLY the title text. No prefixes, labels, quotes, emojis, hashtags, or trailing punctuation.
- Use the same language as the transcript.
- Write a noun phrase naming the topic. Do not write instructions.
- Prefer concrete subjects (product names, projects, decisions) over vague labels.
- Never include meta-words: Session, Meeting, Discussion, Conversation, Audio, Transcript, Summary, Title, Chat, Greeting.

Examples:
Transcript about quarterly budget numbers -> Q3 budget review
Transcript about planning a weekend in New York -> NYC weekend plan
Transcript about debugging a production API -> Production API debugging`;

const QA_TITLE_SYSTEM = `You title live meeting sessions for a voice assistant named Kivo.

Goal: Produce a very short, descriptive title (2–5 words) from the first question someone asked Kivo and Kivo's answer.

Focus on the subject of the question — not the fact that someone asked an AI.

Rules:
- Output ONLY the title text. No prefixes, labels, quotes, emojis, hashtags, or trailing punctuation.
- Use the same language as the question.
- Write a noun phrase naming the topic. Do not write instructions.
- Never include meta-words: Session, Meeting, Discussion, Conversation, Audio, Transcript, Summary, Title, Chat, Question, Request, Kivo.

Examples:
Question: "What did we decide about the launch date?" / Answer about March 15 -> Launch date decision
Question: "Summarize the budget concerns" / Answer listing overruns -> Budget overrun concerns
Question: "Who owns the API migration?" / Answer naming Alex -> API migration ownership`;

const FINALIZE_TITLE_SYSTEM = `You title a finished voice-assistant session by reading its whole transcript (or a running summary of it).

Goal: Produce a very short, descriptive title (2–5 words) naming what the conversation was actually about overall — its main topic or outcome.

The conversation often opens with greetings or thanks; ignore that. Weigh the substance of the whole exchange, not just the first lines.

Rules:
- Output ONLY the title text. No prefixes, labels, quotes, emojis, hashtags, or trailing punctuation.
- Use the same language as the transcript.
- Write a noun phrase naming the topic. Do not write instructions.
- Prefer concrete subjects (product names, projects, decisions) over vague labels.
- Never include meta-words: Session, Meeting, Discussion, Conversation, Audio, Transcript, Summary, Title, Chat, Greeting, Kivo.

Examples:
Transcript ending on a chosen launch date -> Launch date decision
Transcript covering budget overruns -> Budget overrun review
Transcript planning a NYC trip -> NYC trip planning`;

export function isGenericSessionTitle(title: string): boolean {
  const trimmed = title.trim();
  if (trimmed === "Untitled session") return true;
  if (trimmed.startsWith("Session ")) return true;
  return false;
}

export function canAutoTitleSession(
  session: Pick<SessionDoc, "title" | "autoTitled">,
  source: AutoTitleSource
): boolean {
  if (isGenericSessionTitle(session.title)) return true;
  if (source === "qa" && session.autoTitled) return true;
  // The end-of-conversation pass always gets the final say over any title we
  // generated provisionally while the conversation was still evolving. It must
  // not, however, clobber a name the user typed themselves.
  if (source === "finalize" && session.autoTitled) return true;
  return false;
}

export function isSubstantiveUtterance(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_SUBSTANTIVE_CHARS) return false;

  const normalized = trimmed
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (FILLER_UTTERANCES.has(normalized)) return false;
  if (
    normalized.startsWith("good morning") ||
    normalized.startsWith("good afternoon") ||
    normalized.startsWith("good evening")
  ) {
    return false;
  }

  return true;
}

export function getSubstantiveSpeakerTurns(turns: TurnDoc[]): TurnDoc[] {
  return turns.filter(
    (turn) => turn.role === "speaker" && isSubstantiveUtterance(turn.text)
  );
}

export function hasEnoughListeningContext(turns: TurnDoc[]): boolean {
  const speakers = getSubstantiveSpeakerTurns(turns);
  const charCount = speakers.reduce(
    (sum, turn) => sum + turn.text.trim().length,
    0
  );
  return (
    speakers.length >= MIN_SPEAKER_TURNS && charCount >= MIN_SPEAKER_CHARS
  );
}

/** First substantive speaker lines — topics are usually established early. */
export function buildListeningExcerpt(
  turns: TurnDoc[],
  maxTurns = 12
): string {
  return getSubstantiveSpeakerTurns(turns)
    .slice(0, maxTurns)
    .map((turn) => formatTurnForContext(turn))
    .join("\n");
}

/** Whole-conversation excerpt: substantive speaker lines plus every Q&A turn. */
export function buildFullConversationExcerpt(
  turns: TurnDoc[],
  maxTurns = 60
): string {
  const relevant = turns.filter((turn) => {
    if (turn.role === "user_question" || turn.role === "assistant") return true;
    return turn.role === "speaker" && isSubstantiveUtterance(turn.text);
  });
  // Topics usually settle by the end, so keep the *tail* when over budget.
  const windowed =
    relevant.length > maxTurns ? relevant.slice(-maxTurns) : relevant;
  return windowed.map((turn) => formatTurnForContext(turn)).join("\n");
}

/** Enough happened to warrant a final title (real discussion or a Q&A). */
export function hasEnoughFinalizeContext(turns: TurnDoc[]): boolean {
  if (getFirstQaPair(turns)) return true;
  return hasEnoughListeningContext(turns);
}

export function getFirstQaPair(
  turns: TurnDoc[]
): { question: string; answer: string } | null {
  const questionTurn = turns.find((turn) => turn.role === "user_question");
  if (!questionTurn) return null;

  const answerTurn = turns.find(
    (turn) =>
      turn.role === "assistant" && turn.sequence > questionTurn.sequence
  );
  if (!answerTurn) return null;

  return { question: questionTurn.text, answer: answerTurn.text };
}

export function sanitizeGeneratedTitle(
  raw: string,
  fallback?: string
): string | null {
  let title = raw.trim().split("\n")[0]?.trim() ?? "";
  title = title.replace(/^["'`]+|["'`]+$/g, "");
  title = title.replace(/^title:\s*/i, "");
  title = title.replace(/[#*_`]+/g, "").trim();
  title = title.replace(/[.!?:;,]+$/g, "").trim();

  if (!title) {
    if (!fallback?.trim()) return null;
    title = fallbackTitleFromText(fallback);
  }

  if (title.length > MAX_TITLE_CHARS) {
    title = `${title.slice(0, MAX_TITLE_CHARS - 3).trim()}...`;
  }

  return title || null;
}

export function fallbackTitleFromText(text: string): string {
  return text.trim().split(/\s+/g).slice(0, 5).join(" ");
}

async function generateTitleFromPrompt(input: {
  system: string;
  user: string;
  fallback: string;
}): Promise<string | null> {
  try {
    const rawTitle = await llmGenerateText({
      model: KIVO_MODEL_ID,
      system: input.system,
      user: input.user,
      maxOutputTokens: 24,
      temperature: 0,
    });
    return (
      sanitizeGeneratedTitle(rawTitle, fallbackTitleFromText(input.fallback)) ??
      fallbackTitleFromText(input.fallback)
    );
  } catch (error) {
    console.error("[Auto-Title] Error generating title:", error);
    const fallback = sanitizeGeneratedTitle(
      "",
      fallbackTitleFromText(input.fallback)
    );
    return fallback;
  }
}

export async function autoTitleSession(
  uid: string,
  sessionId: string,
  input: AutoTitleInput
): Promise<string | null> {
  try {
    const session = await assertSessionOwner(uid, sessionId);
    if (!canAutoTitleSession(session, input.source)) return null;

    if (input.source === "finalize") {
      const turns = await listTurns(uid, sessionId, 500);
      if (!hasEnoughFinalizeContext(turns)) return null;

      // Prefer the rolling summary (already distilled) when present; otherwise
      // summarize from the full transcript tail.
      const summary = await getSummary(uid, sessionId).catch(() => null);
      const rolling = summary?.rollingSummary?.trim();
      const excerpt = buildFullConversationExcerpt(turns);
      const userInput = rolling
        ? `Conversation summary:\n${rolling}\n\nRecent transcript:\n${excerpt}`
        : `Conversation transcript:\n${excerpt}`;
      if (!userInput.trim()) return null;

      const title = await generateTitleFromPrompt({
        system: FINALIZE_TITLE_SYSTEM,
        user: userInput,
        fallback: rolling || excerpt,
      });
      if (!title) return null;

      await patchSession(uid, sessionId, { title, autoTitled: true });
      return title;
    }

    if (input.source === "listening") {
      const turns = await listTurns(uid, sessionId, 40);
      if (!hasEnoughListeningContext(turns)) return null;

      const excerpt = buildListeningExcerpt(turns);
      if (!excerpt) return null;

      const title = await generateTitleFromPrompt({
        system: LISTENING_TITLE_SYSTEM,
        user: `Meeting excerpt:\n${excerpt}`,
        fallback: excerpt,
      });
      if (!title) return null;

      await patchSession(uid, sessionId, { title, autoTitled: true });
      return title;
    }

    let question = input.question?.trim();
    let answer = input.answer?.trim();
    if (!question || !answer) {
      const turns = await listTurns(uid, sessionId, 50);
      const pair = getFirstQaPair(turns);
      if (!pair) return null;
      question = pair.question;
      answer = pair.answer;
    }

    const title = await generateTitleFromPrompt({
      system: QA_TITLE_SYSTEM,
      user: `Question: ${question}\nAnswer: ${answer}`,
      fallback: question,
    });
    if (!title) return null;

    await patchSession(uid, sessionId, { title, autoTitled: true });
    return title;
  } catch (error) {
    console.error("[Auto-Title] Error:", error);
    return null;
  }
}
