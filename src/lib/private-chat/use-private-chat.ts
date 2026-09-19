"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listPrivateChat, streamPrivateChat } from "@/lib/private-chat/client";
import type { PrivateChatMessage } from "@/lib/private-chat/types";

export type PrivateChatEntryStatus =
  | "persisted"
  | "streaming"
  | "complete"
  | "cancelled"
  | "error";

export interface PrivateChatEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: PrivateChatEntryStatus;
  error?: string;
  interrupted?: boolean;
}

export interface PrivateChatController {
  loaded: boolean;
  loadError: string | null;
  entries: PrivateChatEntry[];
  streaming: boolean;
  send: (question: string) => Promise<void>;
  stop: () => void;
  retryLast: () => Promise<void>;
  reload: () => Promise<void>;
}

const MAX_QUESTION_LENGTH = 12_000;

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function toEntries(messages: PrivateChatMessage[]): PrivateChatEntry[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    status: "persisted",
    interrupted: message.interrupted,
  }));
}

/**
 * The private "Ask Kivo" thread for the open session. Text in, text out —
 * this never touches the audio engine, so typing here while recording leaves
 * the microphone and the spoken-answer path exactly as they were.
 */
export function usePrivateChat(sessionId: string | null): PrivateChatController {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<PrivateChatEntry[]>([]);
  const [pending, setPending] = useState<{
    question: PrivateChatEntry;
    answer: PrivateChatEntry;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(sessionId);
  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);
  const lastQuestionRef = useRef<string | null>(null);

  const load = useCallback(async (sid: string) => {
    setLoaded(false);
    setLoadError(null);
    try {
      const messages = await listPrivateChat(sid);
      if (sessionRef.current !== sid) return;
      setHistory(toEntries(messages));
      setLoaded(true);
    } catch (err) {
      if (sessionRef.current !== sid) return;
      setLoadError(err instanceof Error ? err.message : "Couldn't load the chat.");
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPending(null);
    setHistory([]);
    if (!sessionId) {
      setLoaded(false);
      setLoadError(null);
      return;
    }
    void load(sessionId);
  }, [sessionId, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (rawQuestion: string) => {
      const sid = sessionRef.current;
      const question = rawQuestion.trim();
      if (!sid || !question || question.length > MAX_QUESTION_LENGTH) return;
      if (abortRef.current) return;

      lastQuestionRef.current = question;
      const controller = new AbortController();
      abortRef.current = controller;
      const stamp = Date.now();
      const questionEntry: PrivateChatEntry = {
        id: `local-q-${stamp}`,
        role: "user",
        text: question,
        status: "complete",
      };
      const answerId = `local-a-${stamp}`;
      setPending({
        question: questionEntry,
        answer: { id: answerId, role: "assistant", text: "", status: "streaming" },
      });

      let full = "";
      let failure: { status: "cancelled" | "error"; message: string } | null = null;
      try {
        full = await streamPrivateChat({
          sessionId: sid,
          question,
          signal: controller.signal,
          onToken(chunk) {
            setPending((current) =>
              current && current.answer.id === answerId
                ? {
                    ...current,
                    answer: { ...current.answer, text: current.answer.text + chunk },
                  }
                : current
            );
          },
        });
      } catch (err) {
        const cancelled = controller.signal.aborted || isAbort(err);
        // A stream that errors mid-answer surfaces as a bare network failure;
        // the server has already logged the cause.
        const message =
          err instanceof Error && !/failed to fetch|network/i.test(err.message)
            ? err.message
            : "Kivo couldn't finish that answer.";
        failure = {
          status: cancelled ? "cancelled" : "error",
          message: cancelled ? "Answer stopped." : message,
        };
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
      if (sessionRef.current !== sid) return;

      if (!failure && !full.trim()) {
        failure = { status: "error", message: "Kivo returned an empty answer." };
      }

      // Fold the exchange into local history right away; a reload reconciles
      // against the server copy without the user seeing a gap.
      setPending(null);
      setHistory((current) => [
        ...current,
        questionEntry,
        {
          id: answerId,
          role: "assistant",
          text: full,
          status: failure ? failure.status : "complete",
          error: failure?.status === "error" ? failure.message : undefined,
          interrupted: failure?.status === "cancelled" || undefined,
        },
      ]);
    },
    []
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retryLast = useCallback(async () => {
    const question = lastQuestionRef.current;
    if (!question) return;
    // Drop the failed exchange before asking again so it doesn't sit twice.
    setHistory((current) => {
      const last = current[current.length - 1];
      if (last?.role === "assistant" && last.status === "error") {
        return current.slice(0, -2);
      }
      return current;
    });
    await send(question);
  }, [send]);

  const reload = useCallback(async () => {
    const sid = sessionRef.current;
    if (sid) await load(sid);
  }, [load]);

  const entries = useMemo(
    () => (pending ? [...history, pending.question, pending.answer] : history),
    [history, pending]
  );

  return useMemo(
    () => ({
      loaded,
      loadError,
      entries,
      streaming: Boolean(pending),
      send,
      stop,
      retryLast,
      reload,
    }),
    [loaded, loadError, entries, pending, send, stop, retryLast, reload]
  );
}
