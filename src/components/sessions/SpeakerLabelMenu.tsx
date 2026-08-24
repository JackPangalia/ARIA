"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";

/** Wiring for "that wasn't Jack" — offered on speaker lines while listening. */
export interface SpeakerCorrectionProps {
  enrolledNames: string[];
  /** Allow a transcript tag to create a new learned speaker profile. */
  allowCreate?: boolean;
  onCorrect: (
    line: TranscriptLine,
    correctedName: string | null,
  ) => void | Promise<void>;
}

type SpeakerOption = {
  key: string;
  label: string;
  correctedName: string | null;
  current?: boolean;
};

function speakerOptions(
  line: TranscriptLine,
  enrolledNames: string[],
): SpeakerOption[] {
  const current = line.speakerName;
  const options: SpeakerOption[] = [];
  if (current && !enrolledNames.includes(current)) {
    options.push({
      key: "current",
      label: current,
      correctedName: current,
      current: true,
    });
  }
  for (const name of enrolledNames) {
    options.push({
      key: `name:${name}`,
      label: name,
      correctedName: name,
      current: name === current,
    });
  }
  if (current != null) {
    options.push({
      key: "someone-else",
      label: "Someone else",
      correctedName: null,
    });
  }
  return options;
}

function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 8.2 6.4 11l6.1-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CaretIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`kivo-speaker-caret ${open ? "is-open" : ""}`}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M2.5 4.25 6 7.75l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function speakerHue(name: string): number {
  let hue = 0;
  for (let i = 0; i < name.length; i++) {
    hue = (hue * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hue) % 360;
}

function menuStyle(
  trigger: DOMRect,
  menu: HTMLElement | null,
  phone: boolean,
): CSSProperties {
  const pad = 16;
  if (phone) {
    return {
      position: "fixed",
      left: pad,
      right: pad,
      bottom: `max(${pad}px, env(safe-area-inset-bottom, 0px))`,
      width: "auto",
      maxHeight: "min(62dvh, 26rem)",
      overflow: "auto",
      zIndex: 80,
    };
  }

  const width = 260;
  const height = menu?.offsetHeight ?? 220;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = trigger.left;
  let top = trigger.bottom + 10;
  if (left + width > vw - pad) left = vw - width - pad;
  left = Math.max(pad, left);
  if (top + height > vh - pad) top = trigger.top - height - 10;
  top = Math.max(pad, Math.min(top, vh - height - pad));
  return { position: "fixed", left, top, width, zIndex: 80 };
}

export function SpeakerLabelMenu(props: {
  line: TranscriptLine;
  correction: SpeakerCorrectionProps;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [creating, setCreating] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const options = speakerOptions(props.line, props.correction.enrolledNames);
  const currentLabel = props.line.speakerName ?? "Other speaker";

  useEffect(() => {
    if (props.open) return;
    setCreating(false);
    setNewSpeakerName("");
  }, [props.open]);

  useLayoutEffect(() => {
    if (!props.open) return;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      setStyle(
        menuStyle(trigger, menuRef.current, window.innerWidth < 640),
      );
    };
    place();
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [props.open, creating]);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (options.length === 0 && !props.correction.allowCreate) {
    return <>{props.children}</>;
  }

  const apply = (name: string | null) => {
    props.onClose();
    void props.correction.onCorrect(props.line, name);
  };

  return (
    <span ref={triggerRef} className="relative inline-flex max-w-full">
      <button
        type="button"
        onClick={props.onToggle}
        aria-haspopup="menu"
        aria-expanded={props.open}
        aria-label={`Identify speaker (currently ${currentLabel})`}
        className="inline-flex max-w-full items-center gap-1 rounded-sm text-left font-medium transition-colors hover:text-app focus:outline-none focus-visible:text-app"
      >
        {props.children}
        <CaretIcon open={props.open} />
      </button>
      {props.open
        ? createPortal(
            <>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={props.onClose}
                className="fixed inset-0 z-[70] cursor-default"
              />
              <div
                ref={menuRef}
                role="menu"
                aria-label="Identify speaker"
                style={style}
                className="kivo-popover kivo-popover-in kivo-speaker-menu"
              >
                <div className="kivo-speaker-menu-head">
                  <p className="kivo-speaker-menu-title">Who was that?</p>
                </div>
                <div className="kivo-stagger px-0.5 pb-0.5">
                  {options.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        if (option.current) {
                          props.onClose();
                          return;
                        }
                        apply(option.correctedName);
                      }}
                      className={`kivo-popover-row ${option.current ? "is-current" : ""} ${
                        option.correctedName === null ? "is-quiet" : ""
                      }`}
                    >
                      {option.correctedName ? (
                        <span
                          className="kivo-speaker-chip"
                          style={{
                            background: `hsl(${speakerHue(option.label)} 34% 52%)`,
                            color: "white",
                          }}
                        >
                          {option.label.slice(0, 1).toUpperCase()}
                        </span>
                      ) : (
                        <span className="kivo-speaker-chip is-empty">?</span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.current ? (
                        <span className="kivo-speaker-check">
                          <CheckMark />
                        </span>
                      ) : null}
                    </button>
                  ))}
                  {props.correction.allowCreate ? (
                    creating ? (
                      <form
                        className="flex items-center gap-2 px-2 py-1.5"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const name = newSpeakerName.trim();
                          if (!name) return;
                          apply(name);
                        }}
                      >
                        <input
                          autoFocus
                          value={newSpeakerName}
                          onChange={(event) =>
                            setNewSpeakerName(event.target.value)
                          }
                          maxLength={100}
                          placeholder="Their name"
                          aria-label="New speaker name"
                          className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-2 text-sm text-app outline-none placeholder:text-app-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
                        />
                        <button
                          type="submit"
                          disabled={!newSpeakerName.trim()}
                          className="shrink-0 rounded-xl px-2.5 py-2 text-sm font-medium text-app disabled:opacity-40"
                        >
                          Add
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setCreating(true)}
                        className="kivo-popover-row is-quiet"
                      >
                        <span className="kivo-speaker-chip is-empty">+</span>
                        New speaker
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </span>
  );
}
