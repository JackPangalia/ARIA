import { runAriaAgentStream } from "@/lib/aria/agent";
import { isAbortError } from "@/lib/aria/answer-pipeline";
import { buildContextBundle } from "@/lib/aria/context/build-context";
import { maybeCompactSession } from "@/lib/aria/context/summarize";
import { estimateTokens } from "@/lib/aria/context/token-estimate";
import { DEFAULT_ASK_MODEL_ID, type AskModelId } from "@/lib/aria/models";
import { type ServerEnv } from "@/lib/env";
import { recordAsk } from "@/lib/plan/repository";
import { appendTurn } from "@/lib/sessions/repository";
import type { SessionDoc } from "@/lib/sessions/types";

export interface ChatPipelineInput {
  uid: string;
  session: SessionDoc;
  question: string;
  speaker?: number | null;
  speakerName?: string | null;
  env: ServerEnv;
  signal: AbortSignal;
  askModel?: AskModelId;
}

export interface ChatPipelineResult {
  /** UTF-8 answer tokens as they stream from the model. */
  textStream: ReadableStream<Uint8Array>;
  /** Resolves after streaming + persistence; never rejects (errors surface via the stream). */
  done: Promise<{ answerText: string }>;
}

/**
 * The text-only sibling of {@link runAnswerPipeline}: the *same* engine
 * (context bundle → Aria agent) with the TTS half removed. Chat is just another
 * modality onto the one conversation — its Q/A persist as the same turns voice
 * uses, so the two share history and context. Connectors are disabled for the
 * beta, so there are no Composio tools to load here.
 *
 * The voice pipeline is intentionally left untouched by this path.
 */
export async function runChatPipeline(
  input: ChatPipelineInput
): Promise<ChatPipelineResult> {
  const { uid, session, question, env, signal } = input;
  const sessionId = session.id;
  const speaker = input.speaker ?? null;
  const speakerName = input.speakerName ?? null;
  const askModel = input.askModel ?? DEFAULT_ASK_MODEL_ID;

  // Build context and persist concurrently. Generation must not begin unless
  // the question write succeeds; otherwise an answer could be generated and
  // persisted without its canonical user turn.
  const questionPersistence = appendTurn(uid, sessionId, {
    role: "user_question",
    text: question,
    speaker,
    speakerName,
    sourceUtteranceIds: [],
  });

  const [context] = await Promise.all([
    buildContextBundle({
      uid,
      session,
      question,
      includeMeetingSummary: session.status === "ended",
    }),
    questionPersistence,
  ]);

  const llmStream = await runAriaAgentStream({
    messages: context.messages,
    stableContext: context.stableContext,
    liveTranscript: context.liveTranscript,
    history: context.history,
    question: context.question,
    env,
    uid,
    signal,
    composioTools: {},
    askModel,
    delivery: "text",
    // Voice-identified asker (if any) is addressed as "you"; basic sessions get
    // the no-attribution prompt variant.
    askerName: speakerName,
    speakerAware: session.transcriptionMode !== "basic",
  });

  const encoder = new TextEncoder();
  let resolveDone!: (value: { answerText: string }) => void;
  const done = new Promise<{ answerText: string }>((resolve) => {
    resolveDone = resolve;
  });

  const textStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      let partialPersistenceAttempted = false;

      // A stopped/failed answer must still exist in the thread, holding what was
      // produced — otherwise the next turn sees a question Kivo never answered.
      const persistPartial = async () => {
        if (partialPersistenceAttempted) return;
        partialPersistenceAttempted = true;
        const text = answer.trim();
        if (!text) return;
        try {
          await appendTurn(uid, sessionId, {
            role: "assistant",
            text,
            interrupted: true,
          });
        } catch (err) {
          console.error("[Chat] Failed to persist interrupted answer:", err);
        }
      };

      try {
        const reader = llmStream.getReader();
        while (true) {
          if (signal.aborted) break;
          const { done: rDone, value } = await reader.read();
          if (rDone) break;
          if (!value) continue;
          answer += value;
          controller.enqueue(encoder.encode(value));
        }

        if (signal.aborted) {
          await persistPartial();
          try {
            controller.close();
          } catch {
            // ignore double-close
          }
          resolveDone({ answerText: answer.trim() });
          return;
        }

        const text = answer.trim();
        if (text) {
          await appendTurn(uid, sessionId, { role: "assistant", text });
          // Any later bookkeeping failure must not write the same completed
          // answer a second time as an interrupted partial.
          partialPersistenceAttempted = true;
        }

        // EOF means the canonical answer exists, so the client can refresh
        // immediately without racing Firestore persistence.
        controller.close();

        if (text) {
          import("@/lib/aria/context/auto-title")
            .then(({ autoTitleSession }) => {
              void autoTitleSession(uid, sessionId, {
                source: "qa",
                question: context.question,
                answer: text,
              });
            })
            .catch((err) =>
              console.error("[Chat] auto-title import failed:", err)
            );

          await maybeCompactSession(uid, sessionId).catch((err) =>
            console.error("[Chat] session compaction failed:", err)
          );

          void recordAsk(
            uid,
            context.tokenEstimate + estimateTokens(text)
          ).catch((err) =>
            console.error("[Chat] failed to record ask usage:", err)
          );
        }

        resolveDone({ answerText: text });
      } catch (err) {
        if (isAbortError(err, signal)) {
          await persistPartial();
          try {
            controller.close();
          } catch {
            // ignore double-close
          }
          resolveDone({ answerText: answer.trim() });
          return;
        }
        await persistPartial();
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
