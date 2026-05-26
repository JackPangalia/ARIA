"use client";

import type { SessionFactDoc, SessionPinDoc, TurnDoc } from "@/lib/sessions/types";

function turnLabel(turn: TurnDoc): string {
  if (turn.role === "assistant") return "ARIA";
  if (turn.role === "user_question") {
    return turn.speaker == null
      ? "Question"
      : `Speaker ${turn.speaker + 1} question`;
  }
  return turn.speaker == null ? "Speaker" : `Speaker ${turn.speaker + 1}`;
}

export function TranscriptPanel(props: {
  turns: TurnDoc[];
  pins: SessionPinDoc[];
  query: string;
  onPin: (turnId: string) => void;
  onUnpin: (pinId: string) => void;
}) {
  const needle = props.query.trim().toLowerCase();
  const filteredTurns = needle
    ? props.turns.filter((turn) => turn.text.toLowerCase().includes(needle))
    : props.turns;

  const pinnedTurnIds = new Set(props.pins.map((pin) => pin.turnId));

  return (
    <section className="flex h-full min-h-0 flex-col bg-zinc-950/50">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-2.5">
        <p className="text-[10px] font-medium tracking-[0.35em] text-zinc-500">
          TRANSCRIPT
        </p>
        <p className="mt-0.5 text-xs text-zinc-400">
          {filteredTurns.length} turn{filteredTurns.length === 1 ? "" : "s"}
          {needle ? " matching search" : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {filteredTurns.length === 0 ? (
          <p className="px-2 py-8 text-sm text-zinc-500">
            No transcript yet. Start listening and ARIA will log the room.
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredTurns.map((turn) => {
              const pin = props.pins.find((item) => item.turnId === turn.id);
              return (
                <li
                  key={turn.id}
                  className="rounded-2xl border border-zinc-900 bg-black/40 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                        {turnLabel(turn)}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                        {turn.text}
                      </p>
                      <p className="mt-2 text-[11px] text-zinc-600">
                        {new Date(turn.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        pin ? props.onUnpin(pin.id) : props.onPin(turn.id)
                      }
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] tracking-[0.14em] ${
                        pinnedTurnIds.has(turn.id)
                          ? "border-zinc-300 text-zinc-100"
                          : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                      }`}
                    >
                      {pinnedTurnIds.has(turn.id) ? "PINNED" : "PIN"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export function FactsPanel(props: {
  facts: SessionFactDoc[];
  summaryText?: string | null;
  openQuestions?: string[];
}) {
  return (
    <section className="flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950/30">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-2.5">
        <p className="text-[10px] font-medium tracking-[0.35em] text-zinc-500">
          CONTEXT MEMORY
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {props.summaryText ? (
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Summary
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              {props.summaryText}
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            Summary will appear after enough conversation is compressed.
          </p>
        )}

        {props.openQuestions && props.openQuestions.length > 0 ? (
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Open questions
            </p>
            <ul className="mt-2 space-y-1">
              {props.openQuestions.map((item) => (
                <li key={item} className="text-sm text-zinc-400">
                  - {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {props.facts.length > 0 ? (
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Key facts
            </p>
            <ul className="mt-2 space-y-2">
              {props.facts.map((fact) => (
                <li
                  key={fact.id}
                  className="rounded-xl border border-zinc-900 px-3 py-2 text-sm text-zinc-300"
                >
                  <span className="mr-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    {fact.category}
                  </span>
                  {fact.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
