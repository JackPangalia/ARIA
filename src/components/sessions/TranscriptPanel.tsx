"use client";

import type { SessionFactDoc, SessionPinDoc, TurnDoc } from "@/lib/sessions/types";

function turnLabel(turn: TurnDoc): string {
  if (turn.role === "assistant") return "Kivo";
  if (turn.role === "user_question") {
    return `${turn.speakerName ?? "Other speaker"} question`;
  }
  return turn.speakerName ?? "Other speaker";
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
    <section className="flex h-full min-h-0 flex-col bg-surface/40">
      <div className="shrink-0 border-b border-app px-4 py-2.5">
        <p className="kivo-kicker">
          Transcript
        </p>
        <p className="mt-0.5 text-xs text-app-muted">
          {filteredTurns.length} turn{filteredTurns.length === 1 ? "" : "s"}
          {needle ? " matching search" : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {filteredTurns.length === 0 ? (
          <p className="px-2 py-8 text-sm text-app-muted">
            No transcript yet. Start listening and Kivo will log the room.
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredTurns.map((turn) => {
              const pin = props.pins.find((item) => item.turnId === turn.id);
              return (
                <li
                  key={turn.id}
                  className="rounded-2xl border border-app bg-app/40 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="kivo-kicker">
                        {turnLabel(turn)}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-app">
                        {turn.text}
                      </p>
                      <p className="mt-2 text-[11px] text-app-subtle">
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
                          ? "border-app-strong text-app"
                          : "border-app text-app-subtle hover:border-app-strong hover:text-app-secondary"
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
    <section className="flex h-full min-h-0 flex-col border-l border-app bg-surface/30">
      <div className="shrink-0 border-b border-app px-4 py-2.5">
        <p className="kivo-kicker">
          Context memory
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {props.summaryText ? (
          <div>
            <p className="kivo-kicker">
              Summary
            </p>
            <p className="mt-2 text-sm leading-relaxed text-app-secondary">
              {props.summaryText}
            </p>
          </div>
        ) : (
          <p className="text-sm text-app-muted">
            Summary will appear after enough conversation is compressed.
          </p>
        )}

        {props.openQuestions && props.openQuestions.length > 0 ? (
          <div>
            <p className="kivo-kicker">
              Open questions
            </p>
            <ul className="mt-2 space-y-1">
              {props.openQuestions.map((item) => (
                <li key={item} className="text-sm text-app-muted">
                  - {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {props.facts.length > 0 ? (
          <div>
            <p className="kivo-kicker">
              Key facts
            </p>
            <ul className="mt-2 space-y-2">
              {props.facts.map((fact) => (
                <li
                  key={fact.id}
                  className="rounded-xl border border-app px-3 py-2 text-sm text-app-secondary"
                >
                  <span className="kivo-kicker mr-2">
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
