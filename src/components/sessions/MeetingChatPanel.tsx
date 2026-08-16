"use client";

/**
 * Post-session "Continue chat" dock — PARKED.
 *
 * Not mounted anywhere while `SESSION_CHAT_ENABLED` is false in
 * `src/lib/features.ts`. Keep this file (plus `/api/chat` and
 * `chat-pipeline`) so a future update can remount it from OverviewView.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SimpleMarkdown } from "@/components/sessions/SimpleMarkdown";
import { streamChat } from "@/lib/chat/client";
import {
  isOptimisticExchangePersisted,
  isTerminalOptimisticExchange,
  latestTurnSequence,
  reconcileChatHistory,
  type OptimisticChatExchange,
} from "@/lib/chat/history";
import type { TurnDoc } from "@/lib/sessions/types";

const MAX_QUESTION_LENGTH = 12_000;
const BOTTOM_THRESHOLD_PX = 72;

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5 translate-x-px"
    >
      <path d="M4.5 2.8c0-.7.8-1.2 1.4-.8l8 4.7c.6.3.6 1.2 0 1.6l-8 4.7c-.6.4-1.4-.1-1.4-.8V2.8Z" />
    </svg>
  );
}

export function MeetingChatPanel(props: {
  sessionId: string;
  turns: TurnDoc[];
  disabled?: boolean;
  onRefresh: () => Promise<TurnDoc[]>;
  /** Show a Granola-style Resume/Start pill beside the collapsed dock. */
  resumeLabel?: "RESUME" | "START";
  resumeBusy?: boolean;
  resumeDisabled?: boolean;
  onResume?: () => void;
}) {
  const {
    disabled,
    onRefresh,
    onResume,
    resumeBusy,
    resumeDisabled,
    resumeLabel,
    sessionId,
    turns,
  } = props;
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] =
    useState<OptimisticChatExchange | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const visibleOptimistic =
    optimistic &&
    isTerminalOptimisticExchange(optimistic) &&
    isOptimisticExchangePersisted(turns, optimistic)
      ? null
      : optimistic;
  const messages = useMemo(
    () => reconcileChatHistory(turns, visibleOptimistic),
    [turns, visibleOptimistic]
  );
  const streaming = visibleOptimistic?.status === "streaming";
  const hasHistory = messages.length > 0;
  const summarizing = Boolean(resumeBusy);
  const inputLocked = disabled || summarizing;
  const canSend =
    Boolean(draft.trim()) &&
    draft.length <= MAX_QUESTION_LENGTH &&
    !inputLocked;
  const placeholder = disabled
    ? "Chat unavailable"
    : summarizing
      ? "Summarizing…"
      : hasHistory
        ? "Continue chat"
        : "Ask anything";

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (!expanded || !shouldAutoScrollRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded, messages]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
        textareaRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  const refreshCanonicalHistory = useCallback(
    async (exchange: OptimisticChatExchange) => {
      try {
        const canonicalTurns = await onRefresh();
        if (
          isTerminalOptimisticExchange(exchange) &&
          isOptimisticExchangePersisted(canonicalTurns, exchange)
        ) {
          setOptimistic((current) =>
            current?.id === exchange.id ? null : current
          );
        }
      } catch {
        // Keep the terminal optimistic exchange visible. A later session
        // refresh will reconcile it against Firestore without duplicating it.
      }
    },
    [onRefresh]
  );

  const submitQuestion = useCallback(
    async (questionText: string) => {
      const question = questionText.trim();
      if (
        !question ||
        question.length > MAX_QUESTION_LENGTH ||
        disabled ||
        summarizing ||
        busyRef.current
      ) {
        return;
      }

      busyRef.current = true;
      shouldAutoScrollRef.current = true;
      setExpanded(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const exchange: OptimisticChatExchange = {
        id: crypto.randomUUID(),
        question,
        answer: "",
        afterSequence: latestTurnSequence(turns),
        status: "streaming",
      };
      setOptimistic(exchange);
      setDraft("");

      let fullAnswer = "";
      let failure: { status: "cancelled" | "error"; message: string } | null =
        null;
      try {
        fullAnswer = await streamChat({
          sessionId,
          question,
          signal: controller.signal,
          onToken(chunk) {
            setOptimistic((current) =>
              current?.id === exchange.id
                ? { ...current, answer: current.answer + chunk }
                : current
            );
          },
        });
      } catch (error) {
        const cancelled = controller.signal.aborted || isAbort(error);
        failure = {
          status: cancelled ? "cancelled" : "error",
          message: cancelled
            ? "Answer stopped."
            : error instanceof Error
              ? error.message
              : "Kivo couldn’t answer that question.",
        };
      } finally {
        busyRef.current = false;
        if (abortRef.current === controller) abortRef.current = null;
      }

      if (!failure && !fullAnswer.trim()) {
        failure = {
          status: "error",
          message: "Kivo returned an empty answer.",
        };
      }

      const settled: OptimisticChatExchange = failure
        ? {
            ...exchange,
            answer: fullAnswer,
            status: failure.status,
            error: failure.message,
          }
        : { ...exchange, answer: fullAnswer, status: "complete" };

      setOptimistic((current) => {
        if (current?.id !== exchange.id) return current;
        return {
          ...settled,
          // State receives chunks before streamChat resolves. Keep them if a
          // browser abort caused the returned aggregate to lag by a microtask.
          answer: fullAnswer || current.answer,
        };
      });
      await refreshCanonicalHistory(settled);
    },
    [disabled, refreshCanonicalHistory, sessionId, summarizing, turns]
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitQuestion(draft);
  };

  const collapse = () => {
    setExpanded(false);
    textareaRef.current?.blur();
  };

  const showCollapsedResume = Boolean(onResume) && !expanded;
  const resumeAriaLabel = resumeDisabled
    ? "Conversation archived"
    : resumeLabel === "RESUME"
      ? "Resume recording"
      : "Start recording";

  return (
    // Normal-flow dock, not an absolute overlay: the scroll area above it
    // (min-h-0 flex-1) shrinks as this grows, so an expanded panel pushes
    // summary/transcript content out of view instead of covering it.
    <div className="flex shrink-0 justify-center">
      {/* Same max-width + horizontal padding as the summary column in OverviewView. */}
      <div className="flex w-full max-w-3xl items-stretch gap-2 px-6 pb-4 sm:gap-2.5 sm:px-10 sm:pb-5">
        {showCollapsedResume ? (
          <button
            type="button"
            onClick={onResume}
            disabled={resumeBusy || resumeDisabled}
            aria-label={resumeAriaLabel}
            className="bg-chat-well pointer-events-auto inline-flex aspect-square shrink-0 items-center justify-center rounded-[22px] px-3 text-app transition-[transform,opacity] hover:opacity-95 active:scale-[0.98] disabled:opacity-40 sm:px-3.5"
          >
            {resumeDisabled ? (
              <span className="h-2 w-2 rounded-full bg-app-subtle" />
            ) : (
              <PlayIcon />
            )}
          </button>
        ) : null}

        {/*
          Constant large radius: when short it reads as a pill; when tall it
          becomes the panel. Avoid animating border-radius.
        */}
        <div
          id={`meeting-chat-panel-${sessionId}`}
          aria-expanded={expanded}
          className="bg-chat-panel pointer-events-auto flex min-w-0 flex-1 flex-col overflow-hidden rounded-[22px]"
        >
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={`flex items-center justify-between gap-2.5 border-b border-app px-2.5 pb-2 pt-2.5 transition-opacity duration-200 sm:px-3 ${
                expanded ? "opacity-100" : "opacity-0"
              }`}
            >
              {onResume ? (
                <button
                  type="button"
                  onClick={onResume}
                  disabled={resumeBusy || resumeDisabled}
                  aria-label={resumeAriaLabel}
                  tabIndex={expanded ? 0 : -1}
                  className="grid h-8 w-8 place-items-center rounded-full bg-chat-bubble text-app transition-colors hover:opacity-90 active:scale-95 disabled:opacity-40"
                >
                  {resumeDisabled ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-app-subtle" />
                  ) : (
                    <PlayIcon />
                  )}
                </button>
              ) : (
                <span className="h-8 w-8" aria-hidden="true" />
              )}

              <button
                type="button"
                onClick={collapse}
                aria-label="Close chat"
                tabIndex={expanded ? 0 : -1}
                className="grid h-8 w-8 place-items-center rounded-full bg-chat-bubble text-app transition-colors hover:opacity-90 active:scale-95"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="h-3.5 w-3.5"
                >
                  <path
                    d="m4 4 8 8M12 4 4 12"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div
              ref={scrollRef}
              onScroll={(event) => {
                const element = event.currentTarget;
                shouldAutoScrollRef.current =
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                  BOTTOM_THRESHOLD_PX;
              }}
              className={`max-h-[42vh] overflow-y-auto px-3.5 pb-4 pt-1.5 transition-opacity duration-200 sm:px-4 ${
                expanded ? "opacity-100" : "opacity-0"
              }`}
            >
              {messages.length === 0 ? (
                <p className="px-1 py-5 text-[14px] leading-relaxed text-app-muted">
                  Hey — what do you need?
                </p>
              ) : (
                <div className="space-y-4" aria-live="polite">
                  {messages.map((message) =>
                    message.role === "user" ? (
                      <div key={message.id} className="flex justify-end">
                        <div className="bg-chat-bubble max-w-[85%] whitespace-pre-wrap rounded-[18px] px-3.5 py-2 text-[14px] leading-relaxed text-app sm:max-w-[75%]">
                          {message.text}
                        </div>
                      </div>
                    ) : (
                      <div key={message.id} className="pr-2 sm:pr-8">
                        <div className="text-[14px] leading-[1.65] text-app-secondary [&_strong]:text-app">
                          {message.text ? (
                            <SimpleMarkdown text={message.text} />
                          ) : message.status === "streaming" ? (
                            <span className="inline-flex items-center gap-1.5 text-app-muted">
                              <span className="kivo-skeleton h-2 w-2 rounded-full" />
                              Thinking…
                            </span>
                          ) : null}
                        </div>
                        {message.interrupted &&
                        message.status === "persisted" ? (
                          <p className="mt-2.5 text-[11px] tracking-wide text-app-subtle">
                            Stopped
                          </p>
                        ) : null}
                        {message.error ? (
                          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
                            <span className="text-danger">{message.error}</span>
                            {visibleOptimistic && !disabled ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void submitQuestion(
                                    visibleOptimistic.question
                                  )
                                }
                                disabled={streaming}
                                className="font-medium text-app-muted underline underline-offset-2 transition-colors hover:text-app disabled:opacity-50"
                              >
                                Retry
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className={`shrink-0 transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            expanded ? "px-2.5 pb-2.5 pt-1 sm:px-3" : "p-0"
          }`}
        >
          {disabled ? (
            <p className="px-4 py-3 text-center text-sm text-app-muted">
              Chat is unavailable for archived sessions.
            </p>
          ) : (
            <div
              className={`flex items-end gap-1.5 transition-[border-radius,padding,opacity,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                expanded
                  ? "bg-chat-bubble rounded-full px-3.5 py-1.5"
                  : "bg-chat-well rounded-[22px] px-3.5 py-2"
              } ${summarizing ? "opacity-40" : ""}`}
            >
              <label htmlFor={`meeting-chat-${sessionId}`} className="sr-only">
                Ask about this meeting
              </label>
              <textarea
                ref={textareaRef}
                id={`meeting-chat-${sessionId}`}
                value={draft}
                disabled={inputLocked}
                onFocus={() => {
                  if (!summarizing) setExpanded(true);
                }}
                onChange={(event) => {
                  if (summarizing) return;
                  setDraft(event.target.value);
                  if (!expanded) setExpanded(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    collapse();
                    return;
                  }
                  if (summarizing) return;
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void submitQuestion(draft);
                  }
                }}
                rows={1}
                maxLength={MAX_QUESTION_LENGTH}
                placeholder={placeholder}
                className="block max-h-28 w-full resize-none bg-transparent py-1 text-[14px] leading-relaxed text-app outline-none placeholder:text-app-muted disabled:cursor-not-allowed"
              />
              <div className="flex shrink-0 items-center pb-0.5">
                {streaming ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="rounded-full bg-chat-panel px-2.5 py-1 text-xs font-medium text-app-secondary transition-colors hover:text-app"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!canSend}
                    aria-label="Send"
                    className="grid h-7 w-7 place-items-center rounded-full bg-accent text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-[0.96] disabled:opacity-30"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      fill="none"
                      className="h-3 w-3"
                    >
                      <path
                        d="M8 12V4m0 0L4.75 7.25M8 4l3.25 3.25"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}
        </form>
        </div>
      </div>
    </div>
  );
}
