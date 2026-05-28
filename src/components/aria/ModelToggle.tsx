"use client";

import { useSyncExternalStore } from "react";
import { MODEL_OPTIONS } from "@/lib/aria/models";
import {
  readStoredModel,
  storeModel,
  subscribeModel,
} from "@/lib/aria/model-storage";

function useModel() {
  return useSyncExternalStore(
    subscribeModel,
    readStoredModel,
    () => MODEL_OPTIONS[0].id
  );
}

type ModelToggleProps = {
  variant?: "default" | "settings" | "grok";
};

export function ModelToggle({ variant = "default" }: ModelToggleProps) {
  const current = useModel();

  if (variant === "grok") {
    return (
      <div>
        {MODEL_OPTIONS.map((option) => {
          const active = option.id === current;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => storeModel(option.id)}
              className="grok-model-row w-full text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="grok-model-row-title">{option.label}</div>
                <div className="grok-model-row-desc">{option.blurb}</div>
              </div>
              <span className="grok-radio" data-checked={active} aria-hidden>
                {active ? <span className="grok-radio-dot" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const compact = variant === "settings";

  return (
    <div className={compact ? "divide-y divide-app rounded-xl border border-app" : "space-y-2"}>
      {MODEL_OPTIONS.map((option) => {
        const active = option.id === current;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => storeModel(option.id)}
            aria-pressed={active}
            className={`flex w-full items-start gap-3 text-left transition-colors ${
              compact
                ? `px-4 py-3.5 first:rounded-t-xl last:rounded-b-xl ${
                    active ? "bg-surface-hover" : "hover:bg-surface-hover/60"
                  }`
                : `rounded-xl border px-4 py-3 ${
                    active
                      ? "border-app-strong bg-surface-hover"
                      : "border-app bg-surface hover:bg-surface-hover"
                  }`
            }`}
          >
            <span
              aria-hidden
              className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                active ? "border-accent" : "border-app"
              }`}
            >
              {active ? (
                <span className="h-2 w-2 rounded-full bg-accent" />
              ) : null}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-normal text-app">
                {option.label}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-app-muted">
                {option.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
