"use client";

import { useEffect, useRef, useState } from "react";
import { SimpleMarkdown } from "@/components/sessions/SimpleMarkdown";
import type { PrivateChatController } from "@/lib/private-chat/use-private-chat";
import { PanelClose, PanelHeader } from "./PanelChrome";

const MAX_QUESTION_LENGTH = 12_000;

/**
 * Private, written questions to Kivo. Text only: nothing typed here is spoken,
 * and nothing spoken in the room is echoed back into this thread.
 */
export function AskKivoPanel(props: {
  chat: PrivateChatController;
  disabled?: boolean;
  onClose: () => void;
}) {
  const { chat } = props;
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToEndRef = useRef(true);
  const lastEntry = chat.entries[chat.entries.length - 1];

  useEffect(() => {
    if (!stickToEndRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lastEntry?.id, lastEntry?.text]);

  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true });
  }, []);

  const canSend =
    Boolean(draft.trim()) &&
    draft.length <= MAX_QUESTION_LENGTH &&
    !chat.streaming &&
    !props.disabled;

  const submit = () => {
    if (!canSend) return;
    const question = draft;
    setDraft("");
    stickToEndRef.current = true;
    void chat.send(question);
  };

  return (
    <div className="kivo-conv-panel-inner">
      <PanelHeader
        title="Ask Kivo"
        subtitle="Private — only you see this, and nothing here is said aloud."
        action={<PanelClose label="Close chat" onClick={props.onClose} />}
      />
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToEndRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        className="kivo-conv-panel-scroll kivo-conv-chat-scroll"
      >
        {chat.loadError ? (
          <p className="kivo-conv-chat-note text-danger">
            {chat.loadError}{" "}
            <button type="button" onClick={() => void chat.reload()} className="underline underline-offset-2">
              Retry
            </button>
          </p>
        ) : null}
        {chat.loaded && chat.entries.length === 0 ? (
          <p className="kivo-conv-chat-note">
            Ask about what was said, what you wrote, or anything else. Kivo can see the room transcript and your notes.
          </p>
        ) : null}
        <ol className="kivo-conv-chat-list" aria-live="polite">
          {chat.entries.map((entry) =>
            entry.role === "user" ? (
              <li key={entry.id} className="kivo-conv-chat-user">
                <div className="kivo-conv-chat-bubble">{entry.text}</div>
              </li>
            ) : (
              <li key={entry.id} className="kivo-conv-chat-assistant">
                <div className="kivo-conv-chat-answer">
                  {entry.text ? (
                    <SimpleMarkdown text={entry.text} />
                  ) : entry.status === "streaming" ? (
                    <span className="kivo-conv-answer-waiting">
                      <span className="kivo-skeleton h-2 w-2 rounded-full" />
                      Thinking
                    </span>
                  ) : null}
                </div>
                {entry.interrupted ? (
                  <p className="kivo-conv-chat-meta">Stopped</p>
                ) : null}
                {entry.error ? (
                  <p className="kivo-conv-chat-meta text-danger">
                    {entry.error}{" "}
                    <button
                      type="button"
                      onClick={() => void chat.retryLast()}
                      disabled={chat.streaming}
                      className="underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </p>
                ) : null}
              </li>
            )
          )}
        </ol>
      </div>
      <form
        className="kivo-conv-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor="kivo-private-chat-input" className="sr-only">
          Ask Kivo privately
        </label>
        <textarea
          ref={textareaRef}
          id="kivo-private-chat-input"
          value={draft}
          rows={1}
          maxLength={MAX_QUESTION_LENGTH}
          disabled={props.disabled}
          placeholder={props.disabled ? "Chat unavailable for archived conversations" : "Ask Kivo…"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className="kivo-conv-chat-input"
        />
        {chat.streaming ? (
          <button type="button" onClick={chat.stop} className="kivo-conv-chat-stop">
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!canSend} className="kivo-conv-chat-send" aria-label="Send">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 12V4m0 0L4.75 7.25M8 4l3.25 3.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
