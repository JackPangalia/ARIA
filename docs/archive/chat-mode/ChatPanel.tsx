"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TranscriptLines } from "@/components/sessions/SessionInsightsPanel";
import { askSessionQuestion } from "@/lib/sessions/client";
import { getChatSettings } from "@/lib/plan/client";
import { listSpeakerProfiles } from "@/lib/speakers/client";
import type { SpeakerProfileDoc } from "@/lib/speakers/types";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 19V5M12 5l-6 6M12 5l6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The Chat tab's transcript is the same conversation as Voice — same turns,
// same live updates — just with a typed input added alongside the mic.
export function ChatPanel(props: { sessionId: string; lines: TranscriptLine[] }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakAnswers, setSpeakAnswers] = useState(false);
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfileDoc[]>([]);
  const [askingAs, setAskingAs] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    question: string;
    answer: string;
    speakerName: string | null;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void getChatSettings()
      .then((s) => setSpeakAnswers(s.speakChatAnswers))
      .catch(() => undefined);
    void listSpeakerProfiles()
      .then(setSpeakerProfiles)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Once the real turn shows up via the parent's live subscription/poll, drop
  // the optimistic lines so we don't show the exchange twice.
  useEffect(() => {
    if (!pending) return;
    const answered = props.lines.some(
      (l) => l.role === "user_question" && l.text === pending.question
    );
    if (answered) setPending(null);
  }, [props.lines, pending]);

  const displayLines: TranscriptLine[] = useMemo(() => {
    if (!pending) return props.lines;
    const pendingLines: TranscriptLine[] = [
      {
        id: "pending-q",
        role: "user_question",
        text: pending.question,
        speaker: null,
        speakerName: pending.speakerName,
        providerSpeakerLabel: null,
        sourceUtteranceIds: [],
        isPartial: false,
      },
      {
        id: "pending-a",
        role: "assistant",
        text: pending.answer || (speakAnswers ? "Speaking…" : "…"),
        speaker: null,
        speakerName: null,
        providerSpeakerLabel: null,
        sourceUtteranceIds: [],
        isPartial: true,
      },
    ];
    return [...props.lines, ...pendingLines];
  }, [props.lines, pending, speakAnswers]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [displayLines]);

  const submit = async () => {
    const question = draft.trim();
    if (!question || busy) return;
    setDraft("");
    setBusy(true);
    setError(null);
    setPending({ question, answer: "", speakerName: askingAs });

    const controller = new AbortController();
    abortRef.current = controller;
    const outputMode = speakAnswers ? "audio" : "text";

    try {
      const res = await askSessionQuestion(
        props.sessionId,
        question,
        null,
        askingAs,
        controller.signal,
        [],
        outputMode
      );
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Ask failed (${res.status})`);
      }

      if (outputMode === "text") {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          const chunk = decoder.decode(value, { stream: true });
          setPending((prev) => (prev ? { ...prev, answer: prev.answer + chunk } : prev));
        }
      } else {
        // Audio mode: play the spoken answer; the text line appears once the
        // turn is persisted and lands in `props.lines` via the normal refresh.
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => undefined);
        audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Failed to send message.");
      }
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl min-h-0 flex-col">
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-1 py-4 [scrollbar-width:thin]">
        <TranscriptLines lines={displayLines} />
      </div>

      {error ? <p className="px-1 pb-2 text-xs text-danger">{error}</p> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-2 rounded-3xl border border-app bg-surface px-2 py-2 pl-4 mb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {speakerProfiles.length > 0 ? (
          <div className="flex items-center gap-1.5 px-1 pt-1">
            <span className="text-[10px] uppercase tracking-[0.1em] text-app-subtle">Asking as</span>
            <select
              value={askingAs ?? ""}
              onChange={(e) => setAskingAs(e.target.value || null)}
              className="rounded-full border border-app bg-app px-2 py-0.5 text-xs text-app outline-none"
            >
              <option value="">You</option>
              {speakerProfiles.map((profile) => (
                <option key={profile.id} value={profile.name}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask anything"
            disabled={busy}
            className="flex-1 bg-transparent text-sm text-app outline-none placeholder:text-app-muted disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={busy || !draft.trim()}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-opacity disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </div>
      </form>
    </div>
  );
}
