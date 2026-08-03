import type { TurnDoc } from "@/lib/sessions/types";

export type OptimisticChatStatus =
  | "streaming"
  | "complete"
  | "cancelled"
  | "error";

export interface OptimisticChatExchange {
  id: string;
  question: string;
  answer: string;
  afterSequence: number;
  status: OptimisticChatStatus;
  error?: string;
}

export interface ChatHistoryMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sequence: number | null;
  status: "persisted" | OptimisticChatStatus;
  error?: string;
  interrupted?: boolean;
}

export function isTerminalOptimisticExchange(
  optimistic: OptimisticChatExchange
): boolean {
  return optimistic.status !== "streaming";
}

export function buildChatHistory(turns: TurnDoc[]): ChatHistoryMessage[] {
  return [...turns]
    .sort((a, b) => a.sequence - b.sequence)
    .filter(
      (turn) => turn.role === "user_question" || turn.role === "assistant"
    )
    .map((turn) => ({
      id: `turn-${turn.id}`,
      role: turn.role === "assistant" ? "assistant" : "user",
      text: turn.text,
      sequence: turn.sequence,
      status: "persisted",
      interrupted: turn.interrupted,
    }));
}

function normalized(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function findPersistedExchange(
  history: ChatHistoryMessage[],
  optimistic: OptimisticChatExchange
) {
  const question = history.find(
    (message) =>
      message.role === "user" &&
      message.sequence !== null &&
      message.sequence > optimistic.afterSequence &&
      normalized(message.text) === normalized(optimistic.question)
  );
  const answer = question
    ? history.find(
        (message) =>
          message.role === "assistant" &&
          message.sequence !== null &&
          question.sequence !== null &&
          message.sequence > question.sequence &&
          (!optimistic.answer ||
            normalized(message.text) === normalized(optimistic.answer))
      )
    : undefined;
  return { question, answer };
}

/**
 * Merges the one in-flight client exchange into canonical Firestore turns.
 * Sequence boundaries keep identical questions from older exchanges from
 * swallowing a new optimistic message.
 */
export function reconcileChatHistory(
  turns: TurnDoc[],
  optimistic: OptimisticChatExchange | null
): ChatHistoryMessage[] {
  const history = buildChatHistory(turns);
  if (!optimistic) return history;

  const persisted = findPersistedExchange(history, optimistic);
  const reconciled = history.slice();

  if (!persisted.question) {
    reconciled.push({
      id: `${optimistic.id}-question`,
      role: "user",
      text: optimistic.question,
      sequence: null,
      status: optimistic.status,
    });
  }

  if (!persisted.answer) {
    reconciled.push({
      id: `${optimistic.id}-answer`,
      role: "assistant",
      text: optimistic.answer,
      sequence: null,
      status: optimistic.status,
      error: optimistic.error,
      interrupted: optimistic.status === "cancelled",
    });
  }

  return reconciled;
}

export function isOptimisticExchangePersisted(
  turns: TurnDoc[],
  optimistic: OptimisticChatExchange
): boolean {
  const history = buildChatHistory(turns);
  const persisted = findPersistedExchange(history, optimistic);
  return Boolean(persisted.question && persisted.answer);
}

export function latestTurnSequence(turns: TurnDoc[]): number {
  return turns.reduce((latest, turn) => Math.max(latest, turn.sequence), 0);
}
