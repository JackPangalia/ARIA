"use client";

import { useEffect, useRef, useState } from "react";

const SESSION_TITLE_DISPLAY = {
  header:
    "block max-w-[9rem] truncate text-left text-[15px] font-medium tracking-[-0.01em] sm:max-w-[14rem]",
  tray: "block max-w-[10rem] truncate text-left text-[0.84rem] font-medium tracking-[-0.012em] text-app-muted sm:max-w-[18rem]",
} as const;

const SESSION_TITLE_EDIT = {
  header:
    "block w-[min(100vw-10rem,16rem)] text-left text-[15px] font-medium tracking-[-0.01em] sm:w-64",
  tray: "block w-[min(42vw,18rem)] text-left text-[0.84rem] font-medium tracking-[-0.012em] text-app sm:w-72",
} as const;

export function EditableSessionTitle(props: {
  title: string;
  onRenameTitle: (title: string) => void;
  variant?: "header" | "tray";
}) {
  const variant = props.variant ?? "header";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(props.title);
  }, [props.title, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commitEdit = () => {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === props.title) {
      setDraft(props.title);
      return;
    }
    props.onRenameTitle(next);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(props.title);
  };

  const beginEdit = () => {
    setDraft(props.title);
    setEditing(true);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
            inputRef.current?.blur();
          }
        }}
        aria-label="Conversation title"
        size={Math.min(Math.max(draft.length, props.title.length, 12), 80)}
        className={`${SESSION_TITLE_EDIT[variant]} border-0 bg-transparent p-0 outline-none cursor-text text-app caret-app selection:bg-accent/15`}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={beginEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          beginEdit();
        }
      }}
      className={`${SESSION_TITLE_DISPLAY[variant]} cursor-text transition-colors duration-200 hover:text-app hover:underline hover:decoration-1 hover:underline-offset-[0.2em] hover:decoration-current/45 focus-visible:outline-none focus-visible:text-app focus-visible:underline focus-visible:underline-offset-[0.2em] focus-visible:decoration-current/45 ${
        variant === "tray" ? "" : "text-app-secondary"
      }`}
    >
      {props.title}
    </span>
  );
}
