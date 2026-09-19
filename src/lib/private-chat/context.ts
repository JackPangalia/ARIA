import { buildContextBundle } from "@/lib/aria/context/build-context";
import { estimateTokensForTexts } from "@/lib/aria/context/token-estimate";
import { notesHtmlToText } from "@/lib/notes/sanitize-html";
import type { EnhancedNotesDoc, PersonalNotesDoc } from "@/lib/notes/types";
import type {
  PrivateChatMessage,
} from "@/lib/private-chat/types";
import { PRIVATE_CHAT_HISTORY_LIMIT } from "@/lib/private-chat/types";
import type { ContextHistoryTurn, SessionDoc } from "@/lib/sessions/types";

export interface PrivateChatContext {
  stableContext: string;
  liveTranscript: string;
  history: ContextHistoryTurn[];
  messages: string;
  tokenEstimate: number;
}

/** Cap on each notes block so a huge document can't crowd out the room. */
const NOTES_CONTEXT_CHARS = 24_000;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
}

/**
 * Pure half of the context: given the room bundle and the private material,
 * assemble what the model sees. Exported so tests can pin that notes and chat
 * history end up in the prompt — and that nothing here writes anywhere.
 */
export function composePrivateChatContext(input: {
  room: {
    stableContext: string;
    liveTranscript: string;
    history: ContextHistoryTurn[];
  };
  personal: PersonalNotesDoc;
  enhanced: EnhancedNotesDoc;
  chatHistory: PrivateChatMessage[];
  question: string;
}): PrivateChatContext {
  const roomLines = input.room.history.map((turn) =>
    turn.role === "assistant"
      ? `Kivo (spoken aloud to the room): ${turn.text}`
      : turn.text
  );

  const notesText = clip(notesHtmlToText(input.personal.content), NOTES_CONTEXT_CHARS);
  const enhancedText =
    input.enhanced.status === "ready"
      ? clip(notesHtmlToText(input.enhanced.content), NOTES_CONTEXT_CHARS)
      : "";

  const sections: string[] = [
    `# This chat\n\nThis is a private, written chat with the person who owns these notes. Nobody else in the room sees it and nothing you write here is spoken aloud. Answer them directly and in writing. You can draw on the room conversation, their notes, and the enhanced notes below.`,
    input.room.stableContext,
    `# Room conversation so far (what the microphone has heard, oldest first)\n\n${
      roomLines.join("\n") || "(nothing transcribed yet)"
    }`,
    notesText ? `# The owner's own notes\n\n${notesText}` : null,
    enhancedText ? `# Enhanced notes (Kivo's write-up of the conversation)\n\n${enhancedText}` : null,
  ].filter((section): section is string => Boolean(section));

  const stableContext = sections.join("\n\n");
  const liveTranscript = input.room.liveTranscript;
  const history: ContextHistoryTurn[] = input.chatHistory
    .slice(-PRIVATE_CHAT_HISTORY_LIMIT)
    .map((message) => ({
      role: message.role,
      text: message.interrupted
        ? `${message.text}\n\n[The user stopped this answer here.]`
        : message.text,
    }));
  const messages = [stableContext, liveTranscript].filter(Boolean).join("\n\n");

  return {
    stableContext,
    liveTranscript,
    history,
    messages,
    tokenEstimate: estimateTokensForTexts([
      messages,
      ...history.map((turn) => turn.text),
      input.question,
    ]),
  };
}

/**
 * Reads the room context through the same builder the voice path uses (a
 * read-only operation) and layers the private material on top.
 */
export async function buildPrivateChatContext(input: {
  uid: string;
  session: SessionDoc;
  question: string;
  personal: PersonalNotesDoc;
  enhanced: EnhancedNotesDoc;
  chatHistory: PrivateChatMessage[];
}): Promise<PrivateChatContext> {
  const room = await buildContextBundle({
    uid: input.uid,
    session: input.session,
    question: input.question,
    includeMeetingSummary: true,
  });
  return composePrivateChatContext({
    room,
    personal: input.personal,
    enhanced: input.enhanced,
    chatHistory: input.chatHistory,
    question: input.question,
  });
}
