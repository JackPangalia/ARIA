import { runAriaAgentStream } from "@/lib/aria/agent";
import { isAbortError } from "@/lib/aria/answer-pipeline";
import { estimateTokens } from "@/lib/aria/context/token-estimate";
import { DEFAULT_ASK_MODEL_ID, type AskModelId } from "@/lib/aria/models";
import type { ServerEnv } from "@/lib/env";
import { getEnhancedNotes, getPersonalNotes } from "@/lib/notes/repository";
import { recordAsk } from "@/lib/plan/repository";
import { buildPrivateChatContext } from "@/lib/private-chat/context";
import {
  appendPrivateChatMessage,
  listPrivateChatMessages,
} from "@/lib/private-chat/repository";
import { PRIVATE_CHAT_HISTORY_LIMIT } from "@/lib/private-chat/types";
import type { SessionDoc } from "@/lib/sessions/types";

export interface PrivateChatPipelineInput {
  uid: string;
  session: SessionDoc;
  question: string;
  env: ServerEnv;
  signal: AbortSignal;
  askModel?: AskModelId;
}

export interface PrivateChatPipelineResult {
  textStream: ReadableStream<Uint8Array>;
  /** Resolves after streaming and persistence; never rejects. */
  done: Promise<{ answerText: string }>;
}

/**
 * The owner's private written channel. Same model, same persona, same room
 * context as a spoken answer — but everything it *writes* goes to the `chat`
 * subcollection. It never appends a session turn, never compacts the rolling
 * summary, never touches the prefetch cache, and never retitles the session:
 * a typed question must leave no trace the voice path could pick up.
 */
export async function runPrivateChatPipeline(
  input: PrivateChatPipelineInput
): Promise<PrivateChatPipelineResult> {
  const { uid, session, question, env, signal } = input;
  const sessionId = session.id;
  const askModel = input.askModel ?? DEFAULT_ASK_MODEL_ID;

  // History is read before the question is written so the question is not
  // also the last history entry.
  const [chatHistory, personal, enhanced] = await Promise.all([
    listPrivateChatMessages(uid, sessionId, PRIVATE_CHAT_HISTORY_LIMIT),
    getPersonalNotes(uid, sessionId),
    getEnhancedNotes(uid, sessionId),
  ]);

  const [context] = await Promise.all([
    buildPrivateChatContext({
      uid,
      session,
      question,
      personal,
      enhanced,
      chatHistory,
    }),
    appendPrivateChatMessage(uid, sessionId, { role: "user", text: question }),
  ]);

  const llmStream = await runAriaAgentStream({
    messages: context.messages,
    stableContext: context.stableContext,
    liveTranscript: context.liveTranscript,
    history: context.history,
    question,
    env,
    uid,
    signal,
    composioTools: {},
    askModel,
    delivery: "text",
    askerName: null,
    speakerAware: false,
  });

  const encoder = new TextEncoder();
  let resolveDone!: (value: { answerText: string }) => void;
  const done = new Promise<{ answerText: string }>((resolve) => {
    resolveDone = resolve;
  });

  const textStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      let persisted = false;

      const persist = async (interrupted: boolean) => {
        if (persisted) return;
        persisted = true;
        const text = answer.trim();
        if (!text) return;
        try {
          await appendPrivateChatMessage(uid, sessionId, {
            role: "assistant",
            text,
            interrupted,
          });
        } catch (err) {
          console.error("[PrivateChat] Failed to persist answer:", err);
        }
      };

      const finish = async (interrupted: boolean) => {
        await persist(interrupted);
        try {
          controller.close();
        } catch {
          // Already closed by the consumer.
        }
        const text = answer.trim();
        if (text) {
          void recordAsk(uid, context.tokenEstimate + estimateTokens(text)).catch(
            (err) => console.error("[PrivateChat] failed to record ask usage:", err)
          );
        }
        resolveDone({ answerText: text });
      };

      try {
        const reader = llmStream.getReader();
        while (true) {
          if (signal.aborted) break;
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          if (!value) continue;
          answer += value;
          controller.enqueue(encoder.encode(value));
        }
        await finish(signal.aborted);
      } catch (err) {
        if (isAbortError(err, signal)) {
          await finish(true);
          return;
        }
        await persist(true);
        try {
          controller.error(err);
        } catch {
          // The consumer may already have cancelled the response stream.
        }
        resolveDone({ answerText: answer.trim() });
      }
    },
  });

  return { textStream, done };
}
